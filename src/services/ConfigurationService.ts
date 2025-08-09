import * as vscode from 'vscode';

export type ComparisonMode = 'side-by-side' | 'unified' | 'analysis-only';

export class ConfigurationService {
    private readonly EXTENSION_ID = 'aicompare';

    getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID);
    }

    shouldIncludeGemini(): boolean {
        return this.getConfiguration().get<boolean>('includeGoogleGemini', false);
    }

    getGoogleApiKey(): string | undefined {
        return this.getConfiguration().get<string>('googleApiKey');
    }

    getComparisonMode(): ComparisonMode {
        return this.getConfiguration().get<ComparisonMode>('defaultComparisonMode', 'side-by-side');
    }

    shouldShowTimestamps(): boolean {
        return this.getConfiguration().get<boolean>('showTimestamps', true);
    }

    shouldIncludeMetrics(): boolean {
        return this.getConfiguration().get<boolean>('includeMetrics', true);
    }

    async updateConfiguration<T>(key: string, value: T, target?: vscode.ConfigurationTarget): Promise<void> {
        const config = this.getConfiguration();
        await config.update(key, value, target);
    }

    async promptForGoogleApiKey(): Promise<string | undefined> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Google AI API Key',
            password: true,
            placeHolder: 'AIza...',
            validateInput: (value) => {
                if (!value) return 'API key is required';
                if (!value.startsWith('AIza')) return 'Google API keys typically start with "AIza"';
                return null;
            }
        });

        if (apiKey) {
            await this.updateConfiguration('googleApiKey', apiKey, vscode.ConfigurationTarget.Global);
        }

        return apiKey;
    }

    async promptForComparisonMode(): Promise<ComparisonMode | undefined> {
        const modes: Array<{ label: string; value: ComparisonMode; description: string }> = [
            {
                label: 'Side-by-Side',
                value: 'side-by-side',
                description: 'Show each model response separately'
            },
            {
                label: 'Unified',
                value: 'unified',
                description: 'Combine responses in a unified view'
            },
            {
                label: 'Analysis Only',
                value: 'analysis-only',
                description: 'Show only the comparison analysis'
            }
        ];

        const selected = await vscode.window.showQuickPick(modes, {
            placeHolder: 'Select comparison display mode',
            canPickMany: false
        });

        if (selected) {
            await this.updateConfiguration('defaultComparisonMode', selected.value);
            return selected.value;
        }

        return undefined;
    }

    validateConfiguration(): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];
        
        // Check if Gemini is enabled but no API key is provided
        if (this.shouldIncludeGemini() && !this.getGoogleApiKey()) {
            issues.push('Google Gemini is enabled but no API key is configured');
        }

        // Validate Google API key format if provided
        const googleKey = this.getGoogleApiKey();
        if (googleKey && !googleKey.startsWith('AIza')) {
            issues.push('Google API key format appears to be invalid');
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    getConfigurationSummary(): string {
        const config = this.getConfiguration();
        const summary = [
            `Comparison Mode: ${this.getComparisonMode()}`,
            `Show Timestamps: ${this.shouldShowTimestamps()}`,
            `Include Metrics: ${this.shouldIncludeMetrics()}`,
            `Google Gemini: ${this.shouldIncludeGemini() ? 'Enabled' : 'Disabled'}`,
        ];

        if (this.shouldIncludeGemini()) {
            summary.push(`Google API Key: ${this.getGoogleApiKey() ? 'Configured' : 'Not configured'}`);
        }

        return summary.join('\n');
    }

    async resetToDefaults(): Promise<void> {
        const config = this.getConfiguration();
        await config.update('includeGoogleGemini', undefined);
        await config.update('googleApiKey', undefined);
        await config.update('defaultComparisonMode', undefined);
        await config.update('showTimestamps', undefined);
        await config.update('includeMetrics', undefined);
        
        vscode.window.showInformationMessage('AI Compare settings reset to defaults');
    }

    // Listen for configuration changes
    onConfigurationChanged(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(this.EXTENSION_ID)) {
                callback(e);
            }
        });
    }
}