# AI Code Compare - Setup Instructions

This guide will walk you through setting up the AI Code Compare extension for development and usage.

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** (version 16 or higher) - [Download here](https://nodejs.org/)
- **VS Code** (version 1.90.0 or higher) - [Download here](https://code.visualstudio.com/)
- **GitHub Copilot subscription** with access to both GPT-4o and Claude 3.5 Sonnet
- **Git** for version control - [Download here](https://git-scm.com/)

## 🚀 Quick Start

### Option 1: Install from Marketplace (When Published)

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "AI Code Compare"
4. Click "Install"
5. Reload VS Code if prompted

### Option 2: Development Setup

#### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/ai-code-compare.git
cd ai-code-compare
```

#### Step 2: Install Dependencies

```bash
npm install
```

#### Step 3: Compile TypeScript

```bash
npm run compile
```

#### Step 4: Open in VS Code

```bash
code .
```

#### Step 5: Run the Extension

1. Press `F5` to open a new Extension Development Host window
2. In the new window, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run the command "Developer: Reload Window" if needed
4. Open the chat panel (`Ctrl+Alt+I` / `Cmd+Alt+I`)
5. Type `@aicompare` to start using the extension

## 🔧 Configuration

### GitHub Copilot Setup

1. **Ensure Copilot is Active**:
   - Check the Copilot icon in the VS Code status bar
   - If not active, sign in to GitHub through VS Code

2. **Verify Model Access**:
   - Open any file and try using Copilot chat
   - Make sure you can access both GPT-4o and Claude 3.5 Sonnet
   - You should see model selection options in the chat interface

### Extension Configuration

1. **Open Settings**:
   - Go to `File > Preferences > Settings` (Windows/Linux)
   - Or `VS Code > Preferences > Settings` (macOS)
   - Search for "AI Compare"

2. **Configure Options**:
   ```json
   {
     "aicompare.defaultComparisonMode": "side-by-side",
     "aicompare.showTimestamps": true,
     "aicompare.includeMetrics": true,
     "aicompare.includeGoogleGemini": false
   }
   ```

### Optional: Google Gemini Setup

If you want to include Google Gemini in comparisons:

1. **Get a Google AI API Key**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key (starts with "AIza...")

2. **Configure in VS Code**:
   - Open Settings and search for "AI Compare"
   - Enable "Include Google Gemini"
   - Enter your API key in "Google API Key"

## 📁 Project Structure

After setup, your project should look like this:

```
ai-code-compare/
├── src/                          # Source code
│   ├── extension.ts              # Main extension file
│   └── services/                 # Service classes
│       ├── AICompareService.ts   # AI comparison logic
│       ├── ResponseFormatter.ts  # Response formatting
│       ├── AnalysisService.ts    # Response analysis
│       └── ConfigurationService.ts # Configuration management
├── out/                          # Compiled JavaScript (generated)
├── .vscode/                      # VS Code configuration
│   ├── launch.json              # Debug settings
│   └── tasks.json               # Build tasks
├── images/                       # Extension assets
│   └── robot.png                # Extension icon
├── node_modules/                 # Dependencies (generated)
├── package.json                 # Extension manifest
├── tsconfig.json                # TypeScript config
└── README.md                    # Documentation
```

## 🛠️ Development Workflow

### 1. Make Changes

Edit files in the `src/` directory using TypeScript.

### 2. Compile

```bash
# One-time compilation
npm run compile

# Watch mode (auto-compile on changes)
npm run watch
```

### 3. Test

1. Press `F5` to launch Extension Development Host
2. Test your changes in the new window
3. Check the Debug Console for any errors

### 4. Debug

- Set breakpoints in your TypeScript code
- Use the Debug Console to inspect variables
- Check the Output panel for extension logs

## 🧪 Testing the Extension

### Basic Functionality Test

1. **Open Chat**: `Ctrl+Alt+I` / `Cmd+Alt+I`
2. **Test Basic Command**:
   ```
   @aicompare /compare Write a hello world function
   ```
3. **Verify Response**: You should see responses from both GPT-4o and Claude 3.5 Sonnet

### Advanced Features Test

1. **Code Selection**:
   - Select some code in an editor
   - Right-click → "AI Compare: Compare Selected Code"

2. **Different Commands**:
   ```
   @aicompare /analyze Explain recursion
   @aicompare /explain What is a closure?
   ```

3. **Configuration**:
   - Change comparison mode in settings
   - Test with different configurations

## 🚨 Troubleshooting

### Common Issues

#### "No models available"
- **Cause**: GitHub Copilot not properly configured
- **Solution**: 
  1. Check Copilot subscription status
  2. Sign out and sign back into GitHub in VS Code
  3. Restart VS Code

#### "Language model error"
- **Cause**: Model access issues or quota limits
- **Solution**:
  1. Wait a few minutes and try again
  2. Check GitHub Copilot subscription limits
  3. Try with a simpler prompt

#### Extension not loading
- **Cause**: Compilation errors or missing dependencies
- **Solution**:
  1. Run `npm install` again
  2. Run `npm run compile` and check for errors
  3. Check the Extension Host output for error details

#### Google Gemini not working
- **Cause**: Invalid API key or quota exceeded
- **Solution**:
  1. Verify API key is correct
  2. Check Google Cloud Console for quota limits
  3. Ensure billing is enabled for your Google Cloud project

### Debug Information

To get debug information:

1. **Open Developer Tools**: `Help > Toggle Developer Tools`
2. **Check Console**: Look for error messages
3. **Extension Host Log**: Go to `Output` panel → Select "Extension Host"
4. **Enable Verbose Logging**: Add this to your settings:
   ```json
   {
     "aicompare.debug": true
   }
   ```

## 📦 Building for Distribution

### Package the Extension

```bash
# Install vsce (VS Code Extension packager)
npm install -g vsce

# Package the extension
vsce package

# This creates a .vsix file you can install manually
```

### Install Packaged Extension

```bash
code --install-extension ai-code-compare-1.0.0.vsix
```

## 🔐 Security Considerations

- **API Keys**: Never commit API keys to version control
- **Use VS Code Secret Storage**: The extension stores API keys securely
- **Permissions**: The extension only requests necessary permissions
- **Data Privacy**: No data is stored or transmitted beyond the AI providers

## 📈 Performance Tips

- **Use Watch Mode**: During development, use `npm run watch` for faster iterations
- **Debounce Requests**: The extension automatically prevents rapid-fire requests
- **Monitor Quotas**: Keep track of your API usage limits
- **Optimize Prompts**: Shorter prompts generally get faster responses

## 🆘 Getting Help

If you encounter issues:

1. **Check this guide** for common solutions
2. **Review the logs** in the Developer Tools console
3. **Create an issue** on GitHub with:
   - VS Code version
   - Extension version
   - Error messages
   - Steps to reproduce

---

**You're all set! Start comparing AI responses and discover the differences between models! 🚀**