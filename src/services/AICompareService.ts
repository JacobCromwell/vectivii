import * as vscode from 'vscode';
import { ConfigurationService } from './ConfigurationService';

export interface AIResponse {
    provider: string;
    model: string;
    response: string;
    timestamp: number;
    responseTime: number;
    tokenCount?: number;
    error?: string;
}

export class AICompareService {
    private responses: AIResponse[] = [];

    constructor(private configService: ConfigurationService) {}

    async compareModels(prompt: string, token: vscode.CancellationToken): Promise<AIResponse[]> {
        this.responses = [];
        
        const promises: Promise<void>[] = [];

        // Always try both Copilot models
        promises.push(this.getCopilotGPTResponse(prompt, token));
        promises.push(this.getCopilotClaudeResponse(prompt, token));

        // Optionally include Google Gemini
        if (this.configService.shouldIncludeGemini()) {
            const googleKey = this.configService.getGoogleApiKey();
            if (googleKey) {
                promises.push(this.getGoogleGeminiResponse(prompt, googleKey, token));
            }
        }

        // Wait for all responses (with timeout)
        await Promise.allSettled(promises);
        
        // Sort responses by timestamp
        this.responses.sort((a, b) => a.timestamp - b.timestamp);
        
        return this.responses;
    }

    private async getCopilotGPTResponse(prompt: string, token: vscode.CancellationToken): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Request user consent and select GPT model
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o'
            });

            if (models.length === 0) {
                throw new Error('GPT-4o model not available. Please check your GitHub Copilot subscription.');
            }

            const model = models[0];
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, token);
            
            let fullResponse = '';
            for await (const chunk of response.text) {
                if (token.isCancellationRequested) {
                    throw new Error('Request cancelled');
                }
                fullResponse += chunk;
            }

            const endTime = Date.now();

            this.responses.push({
                provider: 'GitHub Copilot',
                model: `GPT-4o`,
                response: fullResponse,
                timestamp: startTime,
                responseTime: endTime - startTime,
                tokenCount: this.estimateTokenCount(fullResponse)
            });

        } catch (error) {
            console.error('Error with Copilot GPT:', error);
            
            const endTime = Date.now();
            const errorMessage = error instanceof vscode.LanguageModelError 
                ? this.handleLanguageModelError(error)
                : error instanceof Error 
                ? error.message 
                : 'Unknown error occurred';

            this.responses.push({
                provider: 'GitHub Copilot',
                model: 'GPT-4o (Error)',
                response: '',
                timestamp: startTime,
                responseTime: endTime - startTime,
                error: errorMessage
            });
        }
    }

    private async getCopilotClaudeResponse(prompt: string, token: vscode.CancellationToken): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Request user consent and select Claude model
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'claude-3.5-sonnet'
            });

            if (models.length === 0) {
                throw new Error('Claude 3.5 Sonnet model not available. Please check your GitHub Copilot subscription.');
            }

            const model = models[0];
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, token);
            
            let fullResponse = '';
            for await (const chunk of response.text) {
                if (token.isCancellationRequested) {
                    throw new Error('Request cancelled');
                }
                fullResponse += chunk;
            }

            const endTime = Date.now();

            this.responses.push({
                provider: 'GitHub Copilot',
                model: `Claude 3.5 Sonnet`,
                response: fullResponse,
                timestamp: startTime,
                responseTime: endTime - startTime,
                tokenCount: this.estimateTokenCount(fullResponse)
            });

        } catch (error) {
            console.error('Error with Copilot Claude:', error);
            
            const endTime = Date.now();
            const errorMessage = error instanceof vscode.LanguageModelError 
                ? this.handleLanguageModelError(error)
                : error instanceof Error 
                ? error.message 
                : 'Unknown error occurred';

            this.responses.push({
                provider: 'GitHub Copilot',
                model: 'Claude 3.5 Sonnet (Error)',
                response: '',
                timestamp: startTime,
                responseTime: endTime - startTime,
                error: errorMessage
            });
        }
    }

    private async getGoogleGeminiResponse(prompt: string, apiKey: string, token: vscode.CancellationToken): Promise<void> {
        const startTime = Date.now();
        
        try {
            const controller = new AbortController();
            token.onCancellationRequested(() => controller.abort());

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 8192,
                        }
                    }),
                    signal: controller.signal
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Google API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
            
            const endTime = Date.now();

            this.responses.push({
                provider: 'Google',
                model: 'Gemini 1.5 Flash',
                response: text,
                timestamp: startTime,
                responseTime: endTime - startTime,
                tokenCount: this.estimateTokenCount(text)
            });

        } catch (error) {
            console.error('Error with Google Gemini:', error);
            
            const endTime = Date.now();
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            this.responses.push({
                provider: 'Google',
                model: 'Gemini 1.5 Flash (Error)',
                response: '',
                timestamp: startTime,
                responseTime: endTime - startTime,
                error: errorMessage
            });
        }
    }

    private handleLanguageModelError(error: vscode.LanguageModelError): string {
        switch (error.code) {
            case vscode.LanguageModelError.NoAccessToModel:
                return 'No access to this model. Please check your GitHub Copilot subscription.';
            case vscode.LanguageModelError.RequestThrottled:
                return 'Request throttled. Please wait a moment and try again.';
            case vscode.LanguageModelError.Blocked:
                return 'Request blocked. The prompt may violate content policies.';
            default:
                return `Language model error: ${error.message}`;
        }
    }

    private estimateTokenCount(text: string): number {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    public getLastResponses(): AIResponse[] {
        return [...this.responses];
    }
}