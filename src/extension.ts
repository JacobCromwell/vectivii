// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// This is a temporary, in-memory store for model responses.
// In a real-world scenario, this might need to be more robust
// or use the extension's `workspaceState` for persistence.
const comparisonData: { [key: string]: string } = {};
let lastPrompt: string = '';
let comparisonWebviewPanel: vscode.WebviewPanel | undefined;
let analyzedComparison: any = null;

// Interface for structured comparison analysis
interface ComparisonAnalysis {
	summary: string;
	commonElements: string[];
	differences: { [modelId: string]: string[] };
	recommendations: string;
	structuredData: { [modelId: string]: any };
}

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
				// Re-analyze the comparison with the new model
				await analyzeComparison();
				// Refresh the webview with new analysis
				if (comparisonWebviewPanel) {
					comparisonWebviewPanel.webview.postMessage({
						command: 'updateAnalysis',
						analysis: analyzedComparison,
						data: comparisonData
					});
				}
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

// Function to analyze and compare responses using one of the available models
async function analyzeComparison(): Promise<void> {
	if (Object.keys(comparisonData).length < 2) {
		return;
	}

	try {
		// Get an available model for analysis
		const availableModels = await vscode.lm.selectChatModels();
		if (availableModels.length === 0) {
			return;
		}

		const analysisModel = availableModels[0]; // Use the first available model
		const modelIds = Object.keys(comparisonData);
		const responses = Object.values(comparisonData);

		// Create analysis prompt
		const analysisPrompt = `
You are tasked with analyzing and comparing responses from multiple language models. Please provide a structured analysis in JSON format.

Original prompt: "${lastPrompt}"

Model responses:
${modelIds.map((id, index) => `
Model ${id}:
${responses[index]}
`).join('\n')}

Please analyze these responses and return a JSON object with the following structure:
{
	"summary": "A brief summary highlighting key similarities and differences",
	"commonElements": ["list", "of", "elements", "that", "appear", "in", "most", "responses"],
	"differences": {
		"model_id_1": ["unique", "elements", "or", "approaches"],
		"model_id_2": ["unique", "elements", "or", "approaches"]
	},
	"recommendations": "Overall assessment and recommendations based on the comparison",
	"structuredData": {
		"model_id_1": {"key_points": ["point1", "point2"], "approach": "description"},
		"model_id_2": {"key_points": ["point1", "point2"], "approach": "description"}
	}
}

Focus on identifying:
1. Common themes, steps, or recommendations across models
2. Unique insights or approaches from each model
3. Areas where models disagree or take different approaches
4. The overall quality and usefulness of each response

Return only the JSON object, no additional text.`;

		const chatMessages = [vscode.LanguageModelChatMessage.User(analysisPrompt)];
		const chatResponse = await analysisModel.sendRequest(chatMessages, {}, new vscode.CancellationTokenSource().token);

		let analysisResult = '';
		for await (const fragment of chatResponse.text) {
			analysisResult += fragment;
		}

		// Try to parse the JSON response
		try {
			analyzedComparison = JSON.parse(analysisResult);
		} catch (parseError) {
			// Fallback if JSON parsing fails
			analyzedComparison = {
				summary: "Analysis completed. Please review the responses manually.",
				commonElements: [],
				differences: {},
				recommendations: "Manual review recommended due to analysis parsing error.",
				structuredData: {}
			};
		}

	} catch (error) {
		console.error('Error analyzing comparison:', error);
		analyzedComparison = {
			summary: "Error occurred during analysis.",
			commonElements: [],
			differences: {},
			recommendations: "Manual review recommended due to analysis error.",
			structuredData: {}
		};
	}
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

	// Analyze the comparison results
	updateProgress('\n\nAnalyzing responses...');
	await analyzeComparison();

	// Once all responses are collected, add a follow-up button to view the comparison.
	stream.button({
		command: 'jacob.showComparisonView',
		title: 'View Enhanced Side-by-Side Comparison'
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

	// Set the HTML content for the webview.
	comparisonWebviewPanel.webview.html = getWebviewContent(comparisonWebviewPanel.webview, context);

	// Handle messages from the webview.
	comparisonWebviewPanel.webview.onDidReceiveMessage(message => {
		switch (message.command) {
			case 'ready':
				// Once the webview is ready, send both comparison data and analysis to it.
				comparisonWebviewPanel?.webview.postMessage({
					command: 'updateAnalysis',
					analysis: analyzedComparison,
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

// Helper function to read file content
function readFileContent(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error);
		return '';
	}
}

// Function to get the HTML content for the webview.
function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
	// Get URIs for resources
	const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'comparison.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'comparison.js'));

	// Read template HTML (optional - you could also define it here)
	const templatePath = path.join(context.extensionPath, 'media', 'template.html');
	let htmlTemplate = readFileContent(templatePath);

	// Fallback HTML template if file doesn't exist
	if (!htmlTemplate) {
		htmlTemplate = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Enhanced Model Comparison</title>
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{cspSource}} 'unsafe-inline'; script-src {{cspSource}} 'unsafe-inline';">
			<script type="module" src="{{TOOLKIT_URI}}"></script>
			<link rel="stylesheet" href="{{STYLE_URI}}">
		</head>
		<body>
			<div class="header">
				<h1>FAILED to find html</h1>
				<h1>Enhanced Model Comparison</h1>
				<p>Intelligent analysis and side-by-side comparison of language model responses</p>
			</div>

			<div id="analysisSection" class="analysis-section" style="display: none;">
				<h2>Analysis Summary</h2>
				<div id="summaryContent" class="summary-box"></div>
				
				<div id="commonElements">
					<h3>Common Elements</h3>
					<div id="commonTags" class="tags-container"></div>
				</div>

				<div id="differences">
					<h3>Key Differences</h3>
					<div id="differencesGrid" class="differences-grid"></div>
				</div>

				<div id="recommendations">
					<h3>Recommendations</h3>
					<div id="recommendationsContent" class="summary-box"></div>
				</div>
			</div>

			<div id="results" class="comparison-container"></div>

			<div id="loadingSpinner" class="loading-spinner active">
				<div>🔄 Loading comparison results...</div>
			</div>

			<div id="emptyState" class="empty-state" style="display: none;">
				<h3>No Comparison Data Available</h3>
				<p>Run a model comparison to see results here.</p>
			</div>

			<script src="{{SCRIPT_URI}}"></script>
		</body>
		</html>`;
	}

	// Replace placeholders with actual URIs
	return htmlTemplate
		.replace(/\{\{TOOLKIT_URI\}\}/g, toolkitUri.toString())
		.replace(/\{\{STYLE_URI\}\}/g, styleUri.toString())
		.replace(/\{\{SCRIPT_URI\}\}/g, scriptUri.toString())
		.replace(/\{\{cspSource\}\}/g, webview.cspSource);
}

// This method is called when your extension is deactivated
export function deactivate() { }