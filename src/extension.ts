import * as vscode from 'vscode';
import * as path from 'path';

// This is a temporary, in-memory store for model responses.
// In a real-world scenario, this might need to be more robust
// or use the extension's `workspaceState` for persistence.
const comparisonData: { [key: string]: string } = {};
let lastPrompt: string = '';
let comparisonWebviewPanel: vscode.WebviewPanel | undefined;


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

	// Register a command to prompt the user to set default models.
	const setDefaultModelsCommand = vscode.commands.registerCommand('jacob.setDefaultModels', async () => {
		vscode.window.showInformationMessage(
			'To set your default comparison models, you can open the extension settings.'
		);
		// Open the extension settings panel directly
		vscode.commands.executeCommand('workbench.action.openSettings', 'modelbase.defaultModels');
	});

	// Register a command to add a model for evaluation and update the comparison
	const addModelEvalCommand = vscode.commands.registerCommand('jacob.addModelEval', async () => {
		// Use the last prompt to query the new model
		if (!lastPrompt) {
			vscode.window.showErrorMessage('No previous prompt found. Please run a comparison first.');
			return;
		}

		// Get all available models
		const availableModels = await vscode.lm.selectChatModels();

		// Filter out models that are already in the comparison
		const currentModelIds = Object.keys(comparisonData);
		const modelsToAdd = availableModels.filter(model => !currentModelIds.includes(model.id));

		if (modelsToAdd.length === 0) {
			vscode.window.showInformationMessage('There are no other available models to add to the comparison.');
			return;
		}

		const quickPickItems = modelsToAdd.map(model => ({
			label: model.id,
			description: model.name
		}));

		const selectedModel = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: 'Select a model to add to the comparison'
		});

		if (selectedModel) {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Adding model '${selectedModel.label}' to comparison...`,
				cancellable: false
			}, async (progress) => {
				await queryModelAndRefreshWebview(selectedModel.label, context, lastPrompt);
				vscode.window.showInformationMessage(`Model '${selectedModel.label}' added to comparison.`);
			});
		}
	});

	// Add subscriptions to the context so they are disposed of correctly.
	context.subscriptions.push(compareParticipant, showComparisonCommand, setDefaultModelsCommand, addModelEvalCommand);

	// Check if default models are set on first activation or installation
	const isFirstRun = !context.globalState.get('modelbase.hasBeenRun');
	const defaultModels = vscode.workspace.getConfiguration('modelbase').get<string[]>('defaultModels', []);

	if (isFirstRun && defaultModels.length === 0) {
		vscode.window.showInformationMessage(
			'Welcome to Model Comparison! It looks like you haven\'t set your default models yet.',
			'Set Defaults'
		).then(selection => {
			if (selection === 'Set Defaults') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'modelbase.defaultModels');
			}
		});
		context.globalState.update('modelbase.hasBeenRun', true);
	}
}

const getFallbackModelIds = async (): Promise<string[]> => {
	const availableModels = await vscode.lm.selectChatModels();

	if (availableModels.length === 0) {
		return [];
	}

	// Separate models by priority
	const miniModels = availableModels.filter(model =>
		model.family.includes('-mini')
	);

	const gpt4Models = availableModels.filter(model =>
		model.family.includes('gpt-4.0')
	);

	const otherModels = availableModels.filter(model =>
		!model.family.includes('-mini') && !model.family.includes('gpt-4.0')
	);

	// Build priority list: mini models first, then gpt-4.0, then others
	const prioritizedModels = [
		...miniModels,
		...gpt4Models,
		...otherModels
	];

	// Return first 2 from prioritized list
	return prioritizedModels
		.slice(0, 2)
		.map(model => model.id);
};

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

	updateProgress('Starting multi-model comparison...');

	lastPrompt = request.prompt;

	let modelIds: string[] = [];
	const configuration = vscode.workspace.getConfiguration('modelbase');
	const defaultModels = configuration.get<string[]>('defaultModels', []);

	if (defaultModels.length >= 2) {
		modelIds = defaultModels;
		stream.markdown('Using your default language models for comparison.');
	} else {
		// Dynamically get all available chat models if no defaults are set.
		modelIds = await getFallbackModelIds();

		stream.markdown('No default models set. Using the first two available models.');
	}

	if (modelIds.length < 2) {
		stream.markdown('Not enough language models are available for comparison. At least two are required. Ensure you have access to at least 2 language models.');
		return;
	}

	// We'll use this array to store promises for all model requests.
	const modelPromises: Promise<void>[] = [];

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

	// Add a button to add another model to the comparison
	stream.button({
		command: 'jacob.addModelEval',
		title: 'Add another model to comparison'
	});

	return;
};


// Function to create and show the Webview panel.
function showComparisonWebview(context: vscode.ExtensionContext) {
	if (comparisonWebviewPanel) {
		comparisonWebviewPanel.reveal(vscode.ViewColumn.Two);
	} else {
		comparisonWebviewPanel = vscode.window.createWebviewPanel(
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

		// Handle when the webview panel is disposed
		comparisonWebviewPanel.onDidDispose(() => {
			comparisonWebviewPanel = undefined;
		}, null, context.subscriptions);
	}

	// Get the path to the HTML file for the webview.
	const webviewHtmlPath = path.join(context.extensionPath, 'media', 'webview.html');
	// Set the HTML content for the webview.
	comparisonWebviewPanel.webview.html = getWebviewContent(comparisonWebviewPanel.webview, context, webviewHtmlPath);

	// Handle messages from the webview.
	comparisonWebviewPanel.webview.onDidReceiveMessage(message => {
		switch (message.command) {
			case 'ready':
				// Once the webview is ready, send the comparison data to it.
				comparisonWebviewPanel?.webview.postMessage({
					command: 'updateData',
					data: comparisonData
				});
				break;
		}
	});
}

// Helper function to query a new model and update the webview
async function queryModelAndRefreshWebview(modelId: string, context: vscode.ExtensionContext, prompt: string) {
	try {
		const [model] = await vscode.lm.selectChatModels({ family: modelId });

		if (!model) {
			vscode.window.showErrorMessage(`Could not find model: ${modelId}`);
			return;
		}

		const chatMessages = [vscode.LanguageModelChatMessage.User(prompt)];
		const chatResponse = await model.sendRequest(chatMessages, {}, new vscode.CancellationTokenSource().token);

		let fullResponse = '';
		for await (const fragment of chatResponse.text) {
			fullResponse += fragment;
		}

		comparisonData[modelId] = fullResponse;

		// If the webview is open, post a message to update the content
		if (comparisonWebviewPanel) {
			comparisonWebviewPanel.webview.postMessage({
				command: 'updateData',
				data: comparisonData
			});
		}
	} catch (error) {
		console.error(`Error querying model ${modelId}:`, error);
		vscode.window.showErrorMessage(`Failed to get a response from @${modelId}.`);
	}
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
export function deactivate() { }