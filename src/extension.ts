import * as vscode from 'vscode';
import * as path from 'path';

// This is a temporary, in-memory store for model responses.
// In a real-world scenario, this might need to be more robust
// or use the extension's `workspaceState` for persistence.
const comparisonData: { [key: string]: string } = {};

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "modelbase" is now active!');

	// Register the chat participant that will orchestrate the model comparison.
	// This participant is the entry point for the entire workflow.
	const compareParticipant = vscode.chat.createChatParticipant('jacob.compare', compareRequestHandler);

	// Register a command to show the comparison Webview. This command will be
	// triggered by a button in the chat response.
	const showComparisonCommand = vscode.commands.registerCommand('jacob.showComparisonView', () => {
		showComparisonWebview(context);
	});

	// Add subscriptions to the context so they are disposed of correctly.
	context.subscriptions.push(compareParticipant, showComparisonCommand);
}

// The core handler for our orchestrator participant.
const compareRequestHandler: vscode.ChatRequestHandler = async (
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	stream: vscode.ChatResponseStream,
	token: vscode.CancellationToken
) => {
	// A simple helper function to write progress updates to the chat stream.
	const updateProgress = (message: string) => {
		stream.markdown(message);
	};

	// We'll use this array to store promises for all model requests.
	const modelPromises: Promise<void>[] = [];
	const modelIds = ['gpt-4o', 'claude-3.5-sonnet']; // You can add more model IDs here.

	updateProgress('Starting multi-model comparison...');
	
	// Clear the comparison data from the previous run.
	for (const key in comparisonData) {
		delete comparisonData[key];
	}

	for (const modelId of modelIds) {
		modelPromises.push(new Promise<void>(async (resolve) => {
			if (token.isCancellationRequested) {
				updateProgress(`\n\nComparison for ${modelId} was cancelled.`);
				resolve();
				return;
			}
			
			updateProgress(`\n\nQuerying model: \`@${modelId}\`\n\n`);

			try {
				// Select the chat model by its ID. This is the key to the orchestrator pattern.
				const [model] = await vscode.lm.selectChatModels({ family: modelId });

				if (!model) {
					stream.markdown(`Could not find model: ${modelId}`);
					resolve();
					return;
				}

				// Construct the chat messages, ensuring we pass the user's prompt.
				const chatMessages = [vscode.LanguageModelChatMessage.User(request.prompt)];
				
				// Send the request and stream the response.
				const chatResponse = await model.sendRequest(chatMessages, {}, token);
				let fullResponse = '';

				for await (const fragment of chatResponse.text) {
					// We can stream a simplified progress to the user here.
					// Note: This will not be a character-by-character stream for each model,
					// but rather a quick burst of updates as the stream chunks arrive.
					stream.markdown(fragment);
					fullResponse += fragment;
				}
				
				// Store the full response for the comparison Webview.
				comparisonData[modelId] = fullResponse;

			} catch (error) {
				console.error(`Error querying model ${modelId}:`, error);
				stream.markdown(`\n\n**Error:** Failed to get a response from \`@${modelId}\`.\n\n`);
			} finally {
				resolve();
			}
		}));
	}

	// Wait for all model requests to complete.
	await Promise.all(modelPromises);

	// Once all responses are collected, add a follow-up button to view the comparison.
	stream.button({
		command: 'jacob.showComparisonView',
		title: 'View Side-by-Side Comparison'
	});

	return;
};


// Function to create and show the Webview panel.
function showComparisonWebview(context: vscode.ExtensionContext) {
	const panel = vscode.window.createWebviewPanel(
		'jacobComparisonView', // Identifies the type of the webview
		'Model Comparison Results', // Title of the panel displayed to the user
		vscode.ViewColumn.Two, // Editor column to show the new webview panel in
		{
			// Enable scripts in the webview
			enableScripts: true,
			// Restrict the webview to only loading content from our extension's directory
			localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
		}
	);

	// Get the path to the HTML file for the webview.
	const webviewHtmlPath = path.join(context.extensionPath, 'media', 'webview.html');
	// Set the HTML content for the webview.
	panel.webview.html = getWebviewContent(panel.webview, context, webviewHtmlPath);

	// Handle messages from the webview.
	panel.webview.onDidReceiveMessage(message => {
		switch (message.command) {
			case 'ready':
				// Once the webview is ready, send the comparison data to it.
				panel.webview.postMessage({
					command: 'updateData',
					data: comparisonData
				});
				break;
		}
	});
}

// Function to get the HTML content for the webview.
function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext, htmlPath: string): string {
	const htmlUri = vscode.Uri.file(htmlPath);
	const htmlContent = vscode.workspace.fs.readFile(htmlUri);
	
	const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js'));

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Model Comparison</title>
			<script type="module" src="${toolkitUri}"></script>
			<style>
				body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; }
				.comparison-container { display: flex; gap: 20px; padding: 20px; }
				.model-card { flex: 1; border: 1px solid var(--vscode-dropdown-border); border-radius: var(--vscode-editor-pane-background); padding: 10px; background-color: var(--vscode-sideBar-background); }
				h2 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-separator-border); padding-bottom: 5px; }
				pre { white-space: pre-wrap; word-wrap: break-word; }
			</style>
		</head>
		<body>
			<h1>Multi-Model Comparison</h1>
			<p>Here are the responses from the different language models.</p>
			<div id="results" class="comparison-container"></div>

			<script>
				const vscode = acquireVsCodeApi();

				window.addEventListener('message', event => {
					const message = event.data;
					if (message.command === 'updateData') {
						const resultsDiv = document.getElementById('results');
						resultsDiv.innerHTML = '';
						for (const modelId in message.data) {
							const card = document.createElement('div');
							card.className = 'model-card';
							card.innerHTML = \`
								<h2>Model: \${modelId}</h2>
								<pre>\${message.data[modelId]}</pre>
							\`;
							resultsDiv.appendChild(card);
						}
					}
				});

				// Let the extension know the webview is ready to receive data
				window.addEventListener('load', () => {
					vscode.postMessage({ command: 'ready' });
				});
			</script>
		</body>
		</html>
	`;
}


// This method is called when your extension is deactivated
export function deactivate() {}