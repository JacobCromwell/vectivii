import { AIResponse } from './AICompareService';

export interface CodeBlock {
    language: string;
    code: string;
    source: string;
    explanation?: string;
}

export interface AnalysisResult {
    overallSimilarity: number;
    commonPoints: string[];
    keyDifferences: Array<{
        aspect: string;
        description: string;
    }>;
    codeAnalysis?: {
        [modelName: string]: {
            blockCount: number;
            languages: string[];
            complexity: 'Low' | 'Medium' | 'High';
        };
    };
}

export interface ExplanationSections {
    introduction?: string;
    codeBlocks: CodeBlock[];
    keyPoints: string[];
    conclusion?: string;
}

export interface ExplanationQuality {
    model: string;
    clarityScore: number;
    codeExamples: number;
    depthLevel: 'Basic' | 'Intermediate' | 'Advanced';
}

export class AnalysisService {
    
    analyzeResponses(responses: AIResponse[]): AnalysisResult {
        const commonPoints = this.findCommonPoints(responses);
        const keyDifferences = this.findKeyDifferences(responses);
        const similarity = this.calculateSimilarity(responses);
        const codeAnalysis = this.analyzeCodeBlocks(responses);

        return {
            overallSimilarity: similarity,
            commonPoints,
            keyDifferences,
            codeAnalysis
        };
    }

    extractAllCodeBlocks(responses: AIResponse[]): CodeBlock[] {
        const allBlocks: CodeBlock[] = [];
        
        responses.forEach(response => {
            const blocks = this.extractCodeBlocksFromText(response.response);
            blocks.forEach(block => {
                allBlocks.push({
                    ...block,
                    source: response.model
                });
            });
        });

        return allBlocks;
    }

    extractExplanation(responseText: string): string {
        // Remove code blocks and extract explanation text
        const withoutCode = responseText.replace(/```[\s\S]*?```/g, '');
        
        // Take first meaningful paragraph
        const paragraphs = withoutCode.split('\n\n').filter(p => p.trim().length > 50);
        return paragraphs[0]?.trim() || 'No explanation provided';
    }

    extractExplanationSections(responseText: string): ExplanationSections {
        const codeBlocks = this.extractCodeBlocksFromText(responseText);
        const textWithoutCode = responseText.replace(/```[\s\S]*?```/g, '[CODE_BLOCK]');
        
        const paragraphs = textWithoutCode.split('\n\n').filter(p => 
            p.trim().length > 10 && !p.includes('[CODE_BLOCK]')
        );

        const keyPoints = this.extractKeyPoints(responseText);
        
        return {
            introduction: paragraphs[0]?.trim(),
            codeBlocks,
            keyPoints,
            conclusion: paragraphs.length > 1 ? paragraphs[paragraphs.length - 1]?.trim() : undefined
        };
    }

    compareExplanationQuality(responses: AIResponse[]): ExplanationQuality[] {
        return responses.map(response => {
            const codeBlocks = this.extractCodeBlocksFromText(response.response);
            const clarityScore = this.calculateClarityScore(response.response);
            const depthLevel = this.assessDepthLevel(response.response);

            return {
                model: response.model,
                clarityScore,
                codeExamples: codeBlocks.length,
                depthLevel
            };
        });
    }

    private findCommonPoints(responses: AIResponse[]): string[] {
        if (responses.length < 2) return [];

        const commonPoints: string[] = [];
        
        // Extract key concepts mentioned in multiple responses
        const allWords = responses.map(r => 
            this.extractKeyTerms(r.response.toLowerCase())
        );

        // Find terms that appear in most responses
        const termFrequency: { [term: string]: number } = {};
        allWords.forEach(words => {
            const uniqueWords = [...new Set(words)];
            uniqueWords.forEach(word => {
                termFrequency[word] = (termFrequency[word] || 0) + 1;
            });
        });

        const threshold = Math.ceil(responses.length * 0.7); // 70% of responses
        Object.entries(termFrequency).forEach(([term, count]) => {
            if (count >= threshold && term.length > 3) {
                commonPoints.push(`Both models mention ${term}`);
            }
        });

        // Check for common code patterns
        const codePatterns = this.findCommonCodePatterns(responses);
        commonPoints.push(...codePatterns);

        return commonPoints.slice(0, 5); // Limit to top 5
    }

    private findKeyDifferences(responses: AIResponse[]): Array<{ aspect: string; description: string }> {
        if (responses.length < 2) return [];

        const differences: Array<{ aspect: string; description: string }> = [];

        // Compare response lengths
        const lengths = responses.map(r => r.response.length);
        const maxLength = Math.max(...lengths);
        const minLength = Math.min(...lengths);
        
        if (maxLength / minLength > 1.5) {
            const longResponse = responses.find(r => r.response.length === maxLength);
            const shortResponse = responses.find(r => r.response.length === minLength);
            
            differences.push({
                aspect: 'Response Length',
                description: `${longResponse?.model} provides more detailed explanation (${maxLength} chars vs ${minLength} chars)`
            });
        }

        // Compare code complexity
        const codeComplexities = responses.map(r => ({
            model: r.model,
            complexity: this.assessCodeComplexity(r.response)
        }));

        const complexityLevels = [...new Set(codeComplexities.map(c => c.complexity))];
        if (complexityLevels.length > 1) {
            differences.push({
                aspect: 'Code Complexity',
                description: `Different complexity levels: ${codeComplexities.map(c => `${c.model} (${c.complexity})`).join(', ')}`
            });
        }

        // Compare programming approaches
        const approaches = this.identifyProgrammingApproaches(responses);
        if (approaches.length > 1) {
            differences.push({
                aspect: 'Programming Approach',
                description: `Different approaches used: ${approaches.join(', ')}`
            });
        }

        return differences;
    }

    private calculateSimilarity(responses: AIResponse[]): number {
        if (responses.length < 2) return 1.0;

        // Simple similarity based on common words and structure
        const texts = responses.map(r => r.response.toLowerCase());
        const allWords = texts.map(text => this.extractKeyTerms(text));
        
        let totalSimilarity = 0;
        let comparisons = 0;

        for (let i = 0; i < allWords.length; i++) {
            for (let j = i + 1; j < allWords.length; j++) {
                const similarity = this.calculateTextSimilarity(allWords[i], allWords[j]);
                totalSimilarity += similarity;
                comparisons++;
            }
        }

        return comparisons > 0 ? totalSimilarity / comparisons : 0;
    }

    private analyzeCodeBlocks(responses: AIResponse[]): { [modelName: string]: { blockCount: number; languages: string[]; complexity: 'Low' | 'Medium' | 'High' } } {
        const analysis: { [modelName: string]: { blockCount: number; languages: string[]; complexity: 'Low' | 'Medium' | 'High' } } = {};

        responses.forEach(response => {
            const codeBlocks = this.extractCodeBlocksFromText(response.response);
            const languages = [...new Set(codeBlocks.map(b => b.language).filter(Boolean))];
            const complexity = this.assessCodeComplexity(response.response);

            analysis[response.model] = {
                blockCount: codeBlocks.length,
                languages,
                complexity: complexity as 'Low' | 'Medium' | 'High'
            };
        });

        return analysis;
    }

    private extractCodeBlocksFromText(text: string): CodeBlock[] {
        const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)\n```/g;
        const blocks: CodeBlock[] = [];
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            blocks.push({
                language: match[1] || 'plaintext',
                code: match[2].trim(),
                source: 'unknown'
            });
        }

        return blocks;
    }

    private extractKeyTerms(text: string): string[] {
        // Extract meaningful programming and technical terms
        const words = text.match(/\b\w+\b/g) || [];
        const programmingTerms = words.filter(word => 
            word.length > 3 && 
            !this.isCommonWord(word) &&
            (this.isProgrammingTerm(word) || this.isTechnicalTerm(word))
        );
        
        return [...new Set(programmingTerms)];
    }

    private extractKeyPoints(text: string): string[] {
        const points: string[] = [];
        
        // Look for bullet points or numbered lists
        const bulletRegex = /^[\s]*[-*•]\s+(.+)$/gm;
        const numberRegex = /^[\s]*\d+\.\s+(.+)$/gm;
        
        let match;
        
        while ((match = bulletRegex.exec(text)) !== null) {
            points.push(match[1].trim());
        }
        
        while ((match = numberRegex.exec(text)) !== null) {
            points.push(match[1].trim());
        }

        // If no lists found, extract sentences that seem like key points
        if (points.length === 0) {
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
            const keywordSentences = sentences.filter(s => 
                /\b(important|key|note|remember|crucial|essential)\b/i.test(s)
            );
            points.push(...keywordSentences.slice(0, 3).map(s => s.trim()));
        }

        return points.slice(0, 5);
    }

    private calculateClarityScore(text: string): number {
        let score = 5; // Base score

        // Increase score for clear structure
        if (text.includes('```')) score += 1; // Has code examples
        if (/^#+\s/.test(text)) score += 1; // Has headers
        if (text.includes('1.') || text.includes('- ')) score += 1; // Has lists
        
        // Increase for good explanation patterns
        if (/\b(for example|such as|in other words)\b/i.test(text)) score += 1;
        if (/\b(first|second|then|finally)\b/i.test(text)) score += 1;
        
        // Decrease for complexity
        const avgSentenceLength = text.split(/[.!?]+/).reduce((sum, s) => sum + s.length, 0) / text.split(/[.!?]+/).length;
        if (avgSentenceLength > 100) score -= 1;

        return Math.max(1, Math.min(10, score));
    }

    private assessDepthLevel(text: string): 'Basic' | 'Intermediate' | 'Advanced' {
        const technicalTerms = this.extractKeyTerms(text.toLowerCase());
        const codeBlocks = this.extractCodeBlocksFromText(text);
        
        let complexityScore = 0;
        
        // Check for advanced concepts
        if (/\b(algorithm|complexity|optimization|design pattern)\b/i.test(text)) complexityScore += 2;
        if (/\b(recursion|dynamic programming|big o|time complexity)\b/i.test(text)) complexityScore += 2;
        if (technicalTerms.length > 10) complexityScore += 1;
        if (codeBlocks.length > 2) complexityScore += 1;
        
        if (complexityScore >= 4) return 'Advanced';
        if (complexityScore >= 2) return 'Intermediate';
        return 'Basic';
    }

    private findCommonCodePatterns(responses: AIResponse[]): string[] {
        const patterns: string[] = [];
        const allCodeBlocks = this.extractAllCodeBlocks(responses);
        
        // Check for common language usage
        const languages = allCodeBlocks.map(b => b.language);
        const languageFreq: { [lang: string]: number } = {};
        languages.forEach(lang => {
            languageFreq[lang] = (languageFreq[lang] || 0) + 1;
        });
        
        Object.entries(languageFreq).forEach(([lang, count]) => {
            if (count > 1) {
                patterns.push(`Both use ${lang} for implementation`);
            }
        });

        return patterns;
    }

    private calculateTextSimilarity(words1: string[], words2: string[]): number {
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    private assessCodeComplexity(text: string): string {
        const codeBlocks = this.extractCodeBlocksFromText(text);
        if (codeBlocks.length === 0) return 'Low';
        
        let complexityScore = 0;
        
        codeBlocks.forEach(block => {
            const code = block.code.toLowerCase();
            
            // Check for complexity indicators
            if (/\b(for|while|foreach)\b/.test(code)) complexityScore += 1;
            if (/\b(if|else|switch)\b/.test(code)) complexityScore += 1;
            if (/\b(class|function|def|async)\b/.test(code)) complexityScore += 1;
            if (/\b(try|catch|exception)\b/.test(code)) complexityScore += 2;
            if (/\b(recursion|recursive)\b/.test(code)) complexityScore += 3;
        });
        
        if (complexityScore >= 6) return 'High';
        if (complexityScore >= 3) return 'Medium';
        return 'Low';
    }

    private identifyProgrammingApproaches(responses: AIResponse[]): string[] {
        const approaches: string[] = [];
        
        responses.forEach(response => {
            const text = response.response.toLowerCase();
            
            if (/\b(object.oriented|class|inheritance)\b/.test(text)) {
                approaches.push('Object-Oriented');
            }
            if (/\b(functional|lambda|map|filter|reduce)\b/.test(text)) {
                approaches.push('Functional');
            }
            if (/\b(procedural|step.by.step)\b/.test(text)) {
                approaches.push('Procedural');
            }
            if (/\b(async|await|promise|callback)\b/.test(text)) {
                approaches.push('Asynchronous');
            }
        });
        
        return [...new Set(approaches)];
    }

    private isCommonWord(word: string): boolean {
        const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'does', 'let', 'put', 'say', 'she', 'too', 'use'];
        return commonWords.includes(word.toLowerCase());
    }

    private isProgrammingTerm(word: string): boolean {
        const programmingTerms = ['function', 'variable', 'array', 'object', 'method', 'class', 'loop', 'condition', 'string', 'number', 'boolean', 'algorithm', 'code', 'syntax', 'parameter', 'return', 'import', 'export', 'const', 'async', 'await'];
        return programmingTerms.includes(word.toLowerCase());
    }

    private isTechnicalTerm(word: string): boolean {
        const technicalTerms = ['implementation', 'optimization', 'performance', 'complexity', 'efficiency', 'recursion', 'iteration', 'debugging', 'testing', 'documentation'];
        return technicalTerms.includes(word.toLowerCase());
    }
}