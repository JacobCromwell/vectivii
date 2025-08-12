import * as vscode from 'vscode';
import * as https from 'https';
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

    constructor(private configService: ConfigurationService) { }

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

    async getSingleGPTResponse(prompt: string, token: vscode.CancellationToken): Promise<AIResponse[]> {
        this.responses = [];
        // Only get GPT-4o response, with fallback to Claude if it fails
        //await this.getCopilotGPTResponseWithContext(prompt, token);

        // TODO make this dynamic
        const modelSelector = {
            vendor: 'copilot',
            family: 'gpt-4o'
        }

        await this.getModelResponseWithContext(modelSelector, prompt, token);

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

    private async getModelResponseWithContext(modelSelector: { vendor: string; family: string; }, prompt: string, token: vscode.CancellationToken): Promise<void> {
        const startTime = Date.now();

        try {
            const models = await vscode.lm.selectChatModels(modelSelector);

            if (models.length === 0) {
                throw new Error('Model not available. Please check your GitHub Copilot subscription.');
            }

            const model = models[0];

            // Build messages with context
            const messages = await this.buildMessagesWithContext(prompt);

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

    // private async getCopilotGPTResponseWithContext(prompt: string, token: vscode.CancellationToken): Promise<void> {
    //     const startTime = Date.now();

    //     try {
    //         // Request user consent and select GPT model
    //         const models = await vscode.lm.selectChatModels({
    //             vendor: 'copilot',
    //             family: 'gpt-4o'
    //         });

    //         if (models.length === 0) {
    //             throw new Error('GPT-4o model not available. Please check your GitHub Copilot subscription.');
    //         }

    //         const model = models[0];

    //         // Build messages with context
    //         const messages = await this.buildMessagesWithContext(prompt);

    //         const response = await model.sendRequest(messages, {}, token);

    //         let fullResponse = '';
    //         for await (const chunk of response.text) {
    //             if (token.isCancellationRequested) {
    //                 throw new Error('Request cancelled');
    //             }
    //             fullResponse += chunk;
    //         }

    //         const endTime = Date.now();

    //         this.responses.push({
    //             provider: 'GitHub Copilot',
    //             model: `GPT-4o`,
    //             response: fullResponse,
    //             timestamp: startTime,
    //             responseTime: endTime - startTime,
    //             tokenCount: this.estimateTokenCount(fullResponse)
    //         });

    //     } catch (error) {
    //         console.error('Error with Copilot GPT:', error);

    //         const endTime = Date.now();
    //         const errorMessage = error instanceof vscode.LanguageModelError 
    //             ? this.handleLanguageModelError(error)
    //             : error instanceof Error 
    //             ? error.message 
    //             : 'Unknown error occurred';

    //         this.responses.push({
    //             provider: 'GitHub Copilot',
    //             model: 'GPT-4o (Error)',
    //             response: '',
    //             timestamp: startTime,
    //             responseTime: endTime - startTime,
    //             error: errorMessage
    //         });
    //     }
    // }

    private async getCopilotClaudeResponseWithContext(prompt: string, token: vscode.CancellationToken): Promise<void> {
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

            // Build messages with context
            const messages = await this.buildMessagesWithContext(prompt);

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

    private async buildMessagesWithContext(prompt: string): Promise<vscode.LanguageModelChatMessage[]> {
        // Get current editor information
        let contextInfo = '';
        const editor = vscode.window.activeTextEditor;
        
        if (editor) {
            // Add file name and language
            contextInfo += `Current file: ${editor.document.fileName}\n`;
            contextInfo += `Language: ${editor.document.languageId}\n`;
            
            // Add selection if present
            const selection = editor.selection;
            if (!selection.isEmpty) {
                const selectedText = editor.document.getText(selection);
                contextInfo += `\nSelected code:\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\`\n`;
            }
        }

        const messages: vscode.LanguageModelChatMessage[] = [];
        
        // Add assistant context message
        messages.push(vscode.LanguageModelChatMessage.Assistant(
            "I'm an AI assistant in the AI Compare extension. I'll help with coding questions clearly and concisely."
        ));
        
        // Add context + user prompt
        if (contextInfo) {
            messages.push(vscode.LanguageModelChatMessage.User(
                `${contextInfo}\n\nUser request: ${prompt}`
            ));
        } else {
            messages.push(vscode.LanguageModelChatMessage.User(prompt));
        }
        
        return messages;
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
            const postData = JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                }
            });

            const responseText = await this.makeHttpsRequest(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                },
                postData,
                token
            );

            const data = JSON.parse(responseText) as {
                candidates?: Array<{
                    content?: {
                        parts?: Array<{ text?: string }>;
                    };
                }>;
                error?: { message?: string };
            };

            if (data.error) {
                throw new Error(`Google API error: ${data.error.message}`);
            }

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

    private makeHttpsRequest(
        url: string,
        options: { method: string; headers: { [key: string]: string | number } },
        postData: string,
        token: vscode.CancellationToken
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);

            const req = https.request({
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method,
                headers: options.headers
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            // Handle cancellation
            const cancellationListener = token.onCancellationRequested(() => {
                req.destroy();
                reject(new Error('Request cancelled'));
            });

            req.on('close', () => {
                cancellationListener.dispose();
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    private handleLanguageModelError(error: vscode.LanguageModelError): string {
        // Since the specific error codes don't exist in the current VS Code API,
        // we'll handle it based on the error message or use a general approach
        const message = error.message.toLowerCase();

        if (message.includes('access') || message.includes('subscription')) {
            return 'No access to this model. Please check your GitHub Copilot subscription.';
        } else if (message.includes('throttl') || message.includes('rate limit')) {
            return 'Request throttled. Please wait a moment and try again.';
        } else if (message.includes('block') || message.includes('content policy')) {
            return 'Request blocked. The prompt may violate content policies.';
        } else {
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