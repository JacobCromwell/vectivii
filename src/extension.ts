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
                },
                {
                    prompt: 'Get a single GPT-4o response with summary',
                    label: '🎯 Single Trail',
                    command: 'singletrail'
                }
            ];
        }
    };

    // Register commands with proper error handling
    const openPanelCommand = vscode.commands.registerCommand('aicompare.openPanel', async () => {
        try {
            // Try multiple command variations to open chat
            const chatCommands = [
                'workbench.panel.chat.view.copilot.focus',
                'workbench.action.chat.open',
                'workbench.panel.chat',
                'github.copilot.interactiveSession.focus',
                'workbench.action.toggleChatSidebar'
            ];

            let commandExecuted = false;
            
            for (const command of chatCommands) {
                try {
                    await vscode.commands.executeCommand(command);
                    commandExecuted = true;
                    console.log(`Successfully executed command: ${command}`);
                    break;
                } catch (error) {
                    console.log(`Command ${command} failed:`, error);
                    continue;
                }
            }

            if (!commandExecuted) {
                // Fallback: Show information about how to access the chat
                const selection = await vscode.window.showInformationMessage(
                    'Unable to open chat automatically. Please open the chat panel manually.',
                    'Show Instructions',
                    'OK'
                );
                
                if (selection === 'Show Instructions') {
                    vscode.window.showInformationMessage(
                        'To use AI Compare:\n' +
                        '1. Open Chat panel (Ctrl+Alt+I or Cmd+Alt+I)\n' +
                        '2. Type @aicompare followed by your question\n' +
                        '3. Use commands like /compare, /analyze, /explain, or /singletrail'
                    );
                }
            } else {
                // Show success message with instructions
                const infoMessage = await vscode.window.showInformationMessage(
                    'Chat panel opened! Use @aicompare to start comparing AI models.',
                    'Got it'
                );
            }
        } catch (error) {
            console.error('Error in openPanel command:', error);
            vscode.window.showErrorMessage(
                `Failed to open chat panel: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    });

    const compareSelectionCommand = vscode.commands.registerCommand('aicompare.compareSelection', async () => {
        try {
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

            // Try to open chat with different approaches
            try {
                // First try to open the chat panel
                await vscode.commands.executeCommand('workbench.action.chat.open');
                
                // Small delay to ensure chat is ready
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Try to insert the command
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@aicompare /compare Explain and improve this code:\n\`\`\`\n${selection}\n\`\`\``
                });
            } catch (chatError) {
                // Fallback: copy to clipboard and show instructions
                await vscode.env.clipboard.writeText(
                    `@aicompare /compare Explain and improve this code:\n\`\`\`\n${selection}\n\`\`\``
                );
                
                const message = await vscode.window.showInformationMessage(
                    'AI Compare command copied to clipboard. Open the chat panel and paste to compare.',
                    'Open Chat Panel',
                    'OK'
                );
                
                if (message === 'Open Chat Panel') {
                    // Try to open chat panel
                    vscode.commands.executeCommand('aicompare.openPanel');
                }
            }
        } catch (error) {
            console.error('Error in compareSelection command:', error);
            vscode.window.showErrorMessage(
                `Failed to compare selection: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    });

    // Register global slash command: /singletrail (works without @aicompare)
    // Requires VS Code >= 1.103
    const singleTrailSlash = vscode.commands.registerCommand(
        'singletrail',
        async (
            request: vscode.ChatRequest,
            context: vscode.ChatContext,
            stream: vscode.ChatResponseStream,
            token: vscode.CancellationToken
        ) => {
            try {
                stream.markdown('🎯 **Single Trail - GPT-4o Response...**\n\n');
                stream.progress('Querying GPT-4o...');

                const responses = await aiService.getSingleGPTResponse(request.prompt, token);
                await formatter.formatSingleTrail(responses, stream);

                stream.markdown('\n---\n\n💡 Next: Try `/compare` or `/analyze` for multi-model insights.');
            } catch (error) {
                console.error('Global /singletrail error:', error);
                stream.markdown(`❌ **Error**: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
            }
        }
    );

    // Add to subscriptions
    context.subscriptions.push(
        participant,
        singleTrailSlash,
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
        stream.markdown('- `/singletrail` - Get a single GPT-4o response with summary\n');
        return;
    }

    try {
        let responses;
        
        switch (command) {
            case 'compare':
                // Show initial progress
                stream.markdown('🤖 **Comparing AI Models...**\n\n');
                stream.progress('Querying GPT-4o and Claude 3.5 Sonnet...');
                
                responses = await aiService.compareModels(prompt, token);
                await formatter.formatComparison(responses, stream);
                break;
                
            case 'analyze':
                // Show initial progress
                stream.markdown('🤖 **Comparing AI Models...**\n\n');
                stream.progress('Querying GPT-4o and Claude 3.5 Sonnet...');
                
                responses = await aiService.compareModels(prompt, token);
                await formatter.formatAnalysis(responses, stream);
                break;
                
            case 'explain':
                // Show initial progress
                stream.markdown('🤖 **Comparing AI Models...**\n\n');
                stream.progress('Querying GPT-4o and Claude 3.5 Sonnet...');
                
                const explainPrompt = `Explain this concept step by step with examples: ${prompt}`;
                responses = await aiService.compareModels(explainPrompt, token);
                await formatter.formatExplanations(responses, stream);
                break;
                
            case 'singletrail':
                // Show initial progress - FIXED: Only mention GPT-4o
                stream.markdown('🎯 **Single Trail - GPT-4o Response...**\n\n');
                stream.progress('Querying GPT-4o...');
                
                // FIXED: Use getSingleGPTResponse instead of compareModels
                responses = await aiService.getSingleGPTResponse(prompt, token);
                await formatter.formatSingleTrail(responses, stream);
                break;
                
            default:
                responses = [];
                break;
                // Default to comparison
                // Show initial progress
                // stream.markdown('🤖 **Comparing AI Models...**\n\n');
                // stream.progress('Querying GPT-4o and Claude 3.5 Sonnet...');
                
                // responses = await aiService.compareModels(prompt, token);
                // await formatter.formatComparison(responses, stream);
                // break;
        }

        // Add followup suggestions
        if (responses.length >= 1) {
            stream.markdown('\n---\n\n💡 **Next Steps:**\n');
            if (command === 'singletrail') {
                stream.markdown('- Try `/compare` to see how Claude would approach this\n');
                stream.markdown('- Use `/analyze` to get detailed comparison insights\n');
                stream.markdown('- Ask me to explain any specific parts in detail\n');
            } else {
                stream.markdown('- Ask me to explain any differences you notice\n');
                stream.markdown('- Request code improvements or optimizations\n');
                stream.markdown('- Compare different approaches to the same problem\n');
            }
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