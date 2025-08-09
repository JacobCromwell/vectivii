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