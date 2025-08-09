import * as vscode from 'vscode';
import { AICompareService } from './services/AICompareService';
import { ResponseFormatter } from './services/ResponseFormatter';
import { ConfigurationService } from './services/ConfigurationService';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Compare extension is now active!');

    // Initialize services
    const configService = new ConfigurationService();
    const aiService = new AICompareService(configService);
    const formatter = new ResponseFormatter(configService);

    // Register the chat participant
    const participant = vscode.chat.createChatParticipant(
        'aicompare.assistant', 
        async (request, context, stream, token) => {
            try {
                await handleChatRequest(request, context, stream, token, aiService, formatter);
            } catch (error) {
                console.error('Chat request error:', error);
                stream.markdown(`❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
            }
        }
    );

    // Set participant properties
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'robot.png');
    participant.followupProvider = {
        provideFollowups(result, context, token) {
            return [
                {
                    prompt: 'Compare this code solution across multiple models',
                    label: '🔄 Compare Solutions',
                    command: 'compare'
                },
                {
                    prompt: 'Analyze the differences between responses',
                    label: '📊 Analyze Differences',
                    command: 'analyze'
                },
                {
                    prompt: 'Explain this code concept',
                    label: '💡 Get Explanations',
                    command: 'explain'
                }
            ];
        }
    };

    // Register commands
    const openPanelCommand = vscode.commands.registerCommand('aicompare.openPanel', () => {
        vscode.commands.executeCommand('workbench.panel.chatSidebar.copilot');
        vscode.window.showInformationMessage('Use @aicompare in the chat to start comparing AI models!');
    });

    const compareSelectionCommand = vscode.commands.registerCommand('aicompare.compareSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showErrorMessage('No text selected');
            return;
        }

        // Open chat and pre-fill with comparison request
        await vscode.commands.executeCommand('workbench.panel.chatSidebar.copilot');
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@aicompare /compare Explain and improve this code:\n\`\`\`\n${selection}\n\`\`\``
        });
    });

    // Add to subscriptions
    context.subscriptions.push(
        participant,
        openPanelCommand,
        compareSelectionCommand
    );
}

async function handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    aiService: AICompareService,
    formatter: ResponseFormatter
) {
    const command = request.command;
    const prompt = request.prompt;

    if (!prompt.trim()) {
        stream.markdown('Please provide a coding question or request. For example:\n\n');
        stream.markdown('`@aicompare /compare Write a function to reverse a string`\n\n');
        stream.markdown('Available commands:\n');
        stream.markdown('- `/compare` - Compare solutions from multiple AI models\n');
        stream.markdown('- `/analyze` - Analyze differences between responses\n');
        stream.markdown('- `/explain` - Get explanations from both models\n');
        return;
    }

    // Show initial progress
    stream.markdown('🤖 **Comparing AI Models...**\n\n');
    stream.progress('Querying GPT-4o and Claude 3.5 Sonnet...');

    try {
        let responses;
        
        switch (command) {
            case 'compare':
                responses = await aiService.compareModels(prompt, token);
                await formatter.formatComparison(responses, stream);
                break;
                
            case 'analyze':
                responses = await aiService.compareModels(prompt, token);
                await formatter.formatAnalysis(responses, stream);
                break;
                
            case 'explain':
                const explainPrompt = `Explain this concept step by step with examples: ${prompt}`;
                responses = await aiService.compareModels(explainPrompt, token);
                await formatter.formatExplanations(responses, stream);
                break;
                
            default:
                // Default to comparison
                responses = await aiService.compareModels(prompt, token);
                await formatter.formatComparison(responses, stream);
                break;
        }

        // Add followup suggestions
        if (responses.length >= 2) {
            stream.markdown('\n---\n\n💡 **Next Steps:**\n');
            stream.markdown('- Ask me to explain any differences you notice\n');
            stream.markdown('- Request code improvements or optimizations\n');
            stream.markdown('- Compare different approaches to the same problem\n');
        }

    } catch (error) {
        console.error('Error in chat request:', error);
        stream.markdown(`\n❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n`);
        stream.markdown('Please try again or check your GitHub Copilot subscription.');
    }
}

export function deactivate() {
    console.log('AI Code Compare extension deactivated');
}