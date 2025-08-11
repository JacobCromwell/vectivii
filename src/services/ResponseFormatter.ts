import * as vscode from 'vscode';
import { AIResponse } from './AICompareService';
import { ConfigurationService } from './ConfigurationService';
import { AnalysisService } from './AnalysisService';

export class ResponseFormatter {
    private analysisService: AnalysisService;

    constructor(private configService: ConfigurationService) {
        this.analysisService = new AnalysisService();
    }

    async formatComparison(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        const mode = this.configService.getComparisonMode();
        const showTimestamps = this.configService.shouldShowTimestamps();
        const includeMetrics = this.configService.shouldIncludeMetrics();

        // Clear progress and show results
        stream.progress('Formatting comparison...');

        if (responses.length === 0) {
            stream.markdown('⚠️ No responses received. Please check your GitHub Copilot subscription and try again.');
            return;
        }

        // Filter out error responses for main display
        const successfulResponses = responses.filter(r => !r.error);
        const errorResponses = responses.filter(r => r.error);

        if (successfulResponses.length === 0) {
            stream.markdown('❌ **All requests failed:**\n\n');
            for (const response of errorResponses) {
                stream.markdown(`**${response.model}**: ${response.error}\n\n`);
            }
            return;
        }

        // Header
        stream.markdown(`# 🤖 AI Model Comparison\n\n`);
        stream.markdown(`*Comparing ${successfulResponses.length} model${successfulResponses.length > 1 ? 's' : ''}*\n\n`);

        // Display based on mode
        switch (mode) {
            case 'side-by-side':
                await this.formatSideBySide(successfulResponses, stream, showTimestamps);
                break;
            case 'unified':
                await this.formatUnified(successfulResponses, stream, showTimestamps);
                break;
            case 'analysis-only':
                await this.formatAnalysisOnly(successfulResponses, stream);
                return; // Skip metrics for analysis-only mode
        }

        // Show metrics if enabled
        if (includeMetrics && successfulResponses.length > 1) {
            stream.markdown('\n---\n');
            await this.formatMetrics(successfulResponses, stream);
        }

        // Show errors if any
        if (errorResponses.length > 0) {
            stream.markdown('\n---\n');
            stream.markdown('## ⚠️ Errors\n\n');
            for (const response of errorResponses) {
                stream.markdown(`**${response.model}**: ${response.error}\n\n`);
            }
        }
    }

    async formatSingleTrail(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        const showTimestamps = this.configService.shouldShowTimestamps();
        const includeMetrics = this.configService.shouldIncludeMetrics();

        // Clear progress and show results
        stream.progress('Formatting single trail response...');

        if (responses.length === 0) {
            stream.markdown('⚠️ No response received. Please check your GitHub Copilot subscription and try again.');
            return;
        }

        const response = responses[0];

        if (response.error) {
            stream.markdown(`❌ **Error**: ${response.error}\n\n`);
            return;
        }

        // Header
        stream.markdown(`# 🎯 Single Trail Response\n\n`);
        
        // Main response
        stream.markdown(`## ${this.getModelIcon(response.model)} ${response.model}\n\n`);
        
        if (showTimestamps) {
            const timestamp = new Date(response.timestamp).toLocaleTimeString();
            stream.markdown(`*Response time: ${response.responseTime}ms at ${timestamp}*\n\n`);
        }

        // Format the response with proper markdown
        const formattedResponse = this.formatResponseContent(response.response);
        stream.markdown(`${formattedResponse}\n\n`);

        // Add AI Compare summary
        stream.markdown('---\n\n');
        stream.markdown('## 📊 AI Compare Summary\n\n');
        
        const summary = this.generateResponseSummary(response);
        stream.markdown(summary);

        // Show detailed metrics if enabled
        if (includeMetrics) {
            stream.markdown('\n---\n');
            await this.formatSingleResponseMetrics(response, stream);
        }
    }

    async formatAnalysis(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        const successfulResponses = responses.filter(r => !r.error);
        
        if (successfulResponses.length < 2) {
            stream.markdown('🔍 **Analysis requires at least 2 successful responses.**\n\n');
            return;
        }

        stream.markdown('# 📊 Response Analysis\n\n');
        
        const analysis = this.analysisService.analyzeResponses(successfulResponses);
        
        // Similarity Analysis
        stream.markdown('## 🔍 Similarity Analysis\n\n');
        stream.markdown(`**Overall Similarity**: ${(analysis.overallSimilarity * 100).toFixed(1)}%\n\n`);
        
        if (analysis.commonPoints.length > 0) {
            stream.markdown('### ✅ Common Points\n\n');
            analysis.commonPoints.forEach(point => {
                stream.markdown(`- ${point}\n`);
            });
            stream.markdown('\n');
        }

        if (analysis.keyDifferences.length > 0) {
            stream.markdown('### 🔄 Key Differences\n\n');
            analysis.keyDifferences.forEach(diff => {
                stream.markdown(`- **${diff.aspect}**: ${diff.description}\n`);
            });
            stream.markdown('\n');
        }

        // Code Analysis
        if (analysis.codeAnalysis) {
            stream.markdown('## 💻 Code Analysis\n\n');
            const codeAnalysis = analysis.codeAnalysis;
            
            stream.markdown('| Model | Code Blocks | Languages | Complexity |\n');
            stream.markdown('|-------|-------------|-----------|------------|\n');
            
            Object.entries(codeAnalysis).forEach(([model, data]) => {
                stream.markdown(`| ${model} | ${data.blockCount} | ${data.languages.join(', ') || 'None'} | ${data.complexity} |\n`);
            });
            stream.markdown('\n');
        }

        await this.formatMetrics(successfulResponses, stream);
    }

    async formatExplanations(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        const successfulResponses = responses.filter(r => !r.error);

        stream.markdown('# 💡 AI Explanations Comparison\n\n');

        for (const response of successfulResponses) {
            stream.markdown(`## ${response.model} Explanation\n\n`);
            
            const sections = this.analysisService.extractExplanationSections(response.response);
            
            if (sections.introduction) {
                stream.markdown('**Overview:**\n\n');
                stream.markdown(`${sections.introduction}\n\n`);
            }

            if (sections.codeBlocks.length > 0) {
                stream.markdown('**Code Examples:**\n\n');
                sections.codeBlocks.forEach((block, index) => {
                    stream.markdown(`\`\`\`${block.language || ''}\n${block.code}\n\`\`\`\n\n`);
                    if (block.explanation) {
                        stream.markdown(`*${block.explanation}*\n\n`);
                    }
                });
            }

            if (sections.keyPoints.length > 0) {
                stream.markdown('**Key Points:**\n\n');
                sections.keyPoints.forEach(point => {
                    stream.markdown(`- ${point}\n`);
                });
                stream.markdown('\n');
            }

            stream.markdown('---\n\n');
        }

        if (successfulResponses.length > 1) {
            const analysis = this.analysisService.compareExplanationQuality(successfulResponses);
            stream.markdown('## 📈 Explanation Quality Comparison\n\n');
            
            analysis.forEach(item => {
                stream.markdown(`**${item.model}**:\n`);
                stream.markdown(`- Clarity Score: ${item.clarityScore}/10\n`);
                stream.markdown(`- Code Examples: ${item.codeExamples}\n`);
                stream.markdown(`- Depth Level: ${item.depthLevel}\n\n`);
            });
        }
    }

    private generateResponseSummary(response: AIResponse): string {
        const codeBlocks = this.analysisService.extractCodeBlocksFromText(response.response);
        const responseLength = response.response.length;
        const estimatedReadTime = Math.ceil(responseLength / 1000); // ~1000 chars per minute
        
        let summary = '**Response Overview:**\n\n';
        
        // Basic metrics
        summary += `- **Length**: ${responseLength} characters\n`;
        summary += `- **Estimated reading time**: ${estimatedReadTime} minute${estimatedReadTime !== 1 ? 's' : ''}\n`;
        summary += `- **Response time**: ${response.responseTime}ms\n`;
        
        if (response.tokenCount) {
            summary += `- **Estimated tokens**: ${response.tokenCount}\n`;
        }
        
        // Code analysis
        if (codeBlocks.length > 0) {
            const languages = [...new Set(codeBlocks.map(b => b.language).filter(Boolean))];
            summary += `- **Code blocks**: ${codeBlocks.length}\n`;
            if (languages.length > 0) {
                summary += `- **Languages used**: ${languages.join(', ')}\n`;
            }
        }
        
        // Content analysis
        const hasExplanation = response.response.length > 100;
        const hasCodeExamples = codeBlocks.length > 0;
        const hasStructure = /^#+\s/.test(response.response) || response.response.includes('1.') || response.response.includes('- ');
        
        summary += '\n**Content Analysis:**\n\n';
        summary += `- **Explanation quality**: ${hasExplanation ? 'Detailed' : 'Brief'}\n`;
        summary += `- **Code examples**: ${hasCodeExamples ? 'Yes' : 'No'}\n`;
        summary += `- **Structured format**: ${hasStructure ? 'Yes' : 'No'}\n`;
        
        // Complexity assessment
        const complexity = this.assessResponseComplexity(response.response);
        summary += `- **Complexity level**: ${complexity}\n\n`;
        
        return summary;
    }

    private assessResponseComplexity(text: string): string {
        let complexityScore = 0;
        
        // Check for technical terms
        if (/\b(algorithm|complexity|optimization|design pattern)\b/i.test(text)) complexityScore += 2;
        if (/\b(recursion|dynamic programming|big o|time complexity)\b/i.test(text)) complexityScore += 2;
        
        // Check for code complexity indicators
        if (/\b(for|while|foreach|if|else|switch)\b/i.test(text)) complexityScore += 1;
        if (/\b(class|function|def|async|try|catch)\b/i.test(text)) complexityScore += 1;
        
        // Check for advanced concepts
        if (/\b(inheritance|polymorphism|abstraction|encapsulation)\b/i.test(text)) complexityScore += 2;
        
        if (complexityScore >= 5) return 'Advanced';
        if (complexityScore >= 3) return 'Intermediate';
        return 'Basic';
    }

    private async formatSideBySide(responses: AIResponse[], stream: vscode.ChatResponseStream, showTimestamps: boolean): Promise<void> {
        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            
            stream.markdown(`## ${this.getModelIcon(response.model)} ${response.model}\n\n`);
            
            if (showTimestamps) {
                const timestamp = new Date(response.timestamp).toLocaleTimeString();
                stream.markdown(`*Response time: ${response.responseTime}ms at ${timestamp}*\n\n`);
            }

            // Format the response with proper markdown
            const formattedResponse = this.formatResponseContent(response.response);
            stream.markdown(`${formattedResponse}\n\n`);
            
            if (i < responses.length - 1) {
                stream.markdown('---\n\n');
            }
        }
    }

    private async formatUnified(responses: AIResponse[], stream: vscode.ChatResponseStream, showTimestamps: boolean): Promise<void> {
        stream.markdown('## 📋 Unified Comparison\n\n');

        // Extract and display code blocks first
        const allCodeBlocks = this.analysisService.extractAllCodeBlocks(responses);
        
        if (allCodeBlocks.length > 0) {
            stream.markdown('### 💻 Code Solutions\n\n');
            
            allCodeBlocks.forEach((block, index) => {
                stream.markdown(`**${block.source} Solution:**\n\n`);
                stream.markdown(`\`\`\`${block.language || ''}\n${block.code}\n\`\`\`\n\n`);
            });
        }

        // Then display explanations
        stream.markdown('### 📝 Explanations\n\n');
        responses.forEach(response => {
            const explanation = this.analysisService.extractExplanation(response.response);
            stream.markdown(`**${response.model}**: ${explanation}\n\n`);
        });
    }

    private async formatAnalysisOnly(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        await this.formatAnalysis(responses, stream);
    }

    private async formatMetrics(responses: AIResponse[], stream: vscode.ChatResponseStream): Promise<void> {
        stream.markdown('## 📊 Response Metrics\n\n');
        
        stream.markdown('| Model | Response Time | Length | Code Blocks | Estimated Tokens |\n');
        stream.markdown('|-------|---------------|--------|-------------|------------------|\n');
        
        responses.forEach(response => {
            const codeBlocks = (response.response.match(/```/g) || []).length / 2;
            stream.markdown(
                `| ${response.model} | ${response.responseTime}ms | ${response.response.length} chars | ${Math.floor(codeBlocks)} | ${response.tokenCount || 'N/A'} |\n`
            );
        });
        
        stream.markdown('\n');

        // Summary statistics
        const avgTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
        const avgLength = responses.reduce((sum, r) => sum + r.response.length, 0) / responses.length;
        
        stream.markdown(`**Average Response Time**: ${Math.round(avgTime)}ms\n\n`);
        stream.markdown(`**Average Response Length**: ${Math.round(avgLength)} characters\n\n`);
    }

    private async formatSingleResponseMetrics(response: AIResponse, stream: vscode.ChatResponseStream): Promise<void> {
        stream.markdown('## 📊 Response Metrics\n\n');
        
        const codeBlocks = (response.response.match(/```/g) || []).length / 2;
        
        stream.markdown('| Metric | Value |\n');
        stream.markdown('|--------|-------|\n');
        stream.markdown(`| Response Time | ${response.responseTime}ms |\n`);
        stream.markdown(`| Character Count | ${response.response.length} |\n`);
        stream.markdown(`| Code Blocks | ${Math.floor(codeBlocks)} |\n`);
        stream.markdown(`| Estimated Tokens | ${response.tokenCount || 'N/A'} |\n`);
        stream.markdown(`| Provider | ${response.provider} |\n`);
        
        const timestamp = new Date(response.timestamp).toLocaleString();
        stream.markdown(`| Generated At | ${timestamp} |\n\n`);
        
        // Additional analysis
        const words = response.response.split(/\s+/).length;
        const avgWordsPerSentence = response.response.split(/[.!?]+/).length > 0 
            ? Math.round(words / response.response.split(/[.!?]+/).length) 
            : 0;
            
        stream.markdown('### 📈 Additional Analysis\n\n');
        stream.markdown(`- **Word count**: ${words}\n`);
        stream.markdown(`- **Average words per sentence**: ${avgWordsPerSentence}\n`);
        stream.markdown(`- **Reading complexity**: ${this.assessResponseComplexity(response.response)}\n\n`);
    }

    private formatResponseContent(content: string): string {
        // Ensure proper markdown formatting
        return content
            .replace(/^```(\w+)?\s*\n/gm, '```$1\n') // Clean up code block starts
            .replace(/\n```\s*$/gm, '\n```') // Clean up code block ends
            .trim();
    }

    private getModelIcon(modelName: string): string {
        if (modelName.includes('GPT') || modelName.includes('gpt')) {
            return '🤖';
        } else if (modelName.includes('Claude') || modelName.includes('claude')) {
            return '🧠';
        } else if (modelName.includes('Gemini') || modelName.includes('gemini')) {
            return '🌐';
        }
        return '🔮';
    }
}