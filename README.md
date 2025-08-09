# AI Code Compare

Compare coding solutions from multiple AI models directly in VS Code! This extension lets you query both GPT-4o and Claude 3.5 Sonnet through your GitHub Copilot subscription and compare their responses side-by-side.

## ✨ Features

- 🤖 **Dual AI Comparison**: Compare responses from GPT-4o and Claude 3.5 Sonnet
- 💬 **Native Chat Integration**: Use `@aicompare` in VS Code's chat interface
- 📊 **Detailed Analysis**: Get insights into differences, similarities, and code quality
- 🔄 **Multiple Display Modes**: Side-by-side, unified, or analysis-only views
- 🌐 **Optional Gemini Support**: Add Google's Gemini for three-way comparisons
- ⚡ **Context Menu Integration**: Right-click selected code to compare improvements
- 📈 **Response Metrics**: Compare response times, lengths, and complexity

## 🚀 Getting Started

### Prerequisites

- VS Code version 1.90.0 or higher
- GitHub Copilot subscription with access to both GPT-4o and Claude 3.5 Sonnet
- (Optional) Google AI API key for Gemini comparisons

### Installation

1. Install the extension from the VS Code marketplace
2. Ensure you have an active GitHub Copilot subscription
3. Open the chat panel (`Ctrl+Alt+I` / `Cmd+Alt+I`)
4. Type `@aicompare` to start using the extension

## 💻 Usage

### Basic Comparison

```
@aicompare /compare Write a function to find the longest palindrome in a string
```

### Code Analysis

```
@aicompare /analyze Explain the time complexity of bubble sort
```

### Code Explanations

```
@aicompare /explain What is recursion and how does it work?
```

### Context Menu

1. Select code in the editor
2. Right-click and choose "AI Compare: Compare Selected Code"
3. The chat will open with your code pre-loaded for comparison

## 🛠️ Configuration

Access settings via `File > Preferences > Settings` and search for "AI Compare":

- **Comparison Mode**: Choose how responses are displayed
  - `side-by-side`: Show each model response separately (default)
  - `unified`: Combine responses in a unified view
  - `analysis-only`: Show only the comparison analysis

- **Include Google Gemini**: Enable three-way comparisons with Gemini
- **Google API Key**: Required if Gemini is enabled
- **Show Timestamps**: Display response timing information
- **Include Metrics**: Show detailed response statistics

## 📋 Commands

| Command | Description |
|---------|-------------|
| `@aicompare /compare <prompt>` | Compare solutions from multiple models |
| `@aicompare /analyze <prompt>` | Focus on analysis and differences |
| `@aicompare /explain <prompt>` | Get explanations from both models |
| `AI Compare: Open Chat` | Open the chat panel |
| `AI Compare: Compare Selected Code` | Compare selected code |

## 🎯 Example Outputs

### Side-by-Side Comparison

```markdown
# 🤖 AI Model Comparison

## 🤖 GPT-4o
*Response time: 1,234ms*

Here's a Python solution for finding palindromes:

```python
def longest_palindrome(s):
    if not s:
        return ""
    
    start = 0
    max_len = 1
    
    for i in range(len(s)):
        # Check for odd length palindromes
        left, right = i, i
        while left >= 0 and right < len(s) and s[left] == s[right]:
            current_len = right - left + 1
            if current_len > max_len:
                start = left
                max_len = current_len
            left -= 1
            right += 1
    
    return s[start:start + max_len]
```

## 🧠 Claude 3.5 Sonnet
*Response time: 1,456ms*

I'll provide a solution using the expand-around-centers approach:

```python
def find_longest_palindrome(string):
    """Find the longest palindromic substring."""
    def expand_around_center(left, right):
        while (left >= 0 and right < len(string) and 
               string[left] == string[right]):
            left -= 1
            right += 1
        return right - left - 1
    
    if not string:
        return ""
    
    start = end = 0
    
    for i in range(len(string)):
        # Odd length palindromes
        len1 = expand_around_center(i, i)
        # Even length palindromes  
        len2 = expand_around_center(i, i + 1)
        
        max_len = max(len1, len2)
        if max_len > end - start:
            start = i - (max_len - 1) // 2
            end = i + max_len // 2
    
    return string[start:end + 1]
```

---

## 📊 Response Metrics

| Model | Response Time | Length | Code Blocks | Estimated Tokens |
|-------|---------------|--------|-------------|------------------|
| GPT-4o | 1,234ms | 892 chars | 1 | 223 |
| Claude 3.5 Sonnet | 1,456ms | 1,247 chars | 1 | 312 |

**Average Response Time**: 1,345ms
**Average Response Length**: 1,070 characters
```

## 🔧 Development

### Setup

```bash
# Clone the repository
git clone https://github.com/JacobCromwell/vectasight
cd vectasight

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Open in VS Code
code .

# Press F5 to run the extension in a new Extension Development Host window
```

### Project Structure

```
vectasight/
├── src/
│   ├── extension.ts              # Main extension entry point
│   └── services/
│       ├── AICompareService.ts   # Core AI comparison logic
│       ├── ResponseFormatter.ts  # Response formatting and display
│       ├── AnalysisService.ts    # Response analysis and comparison
│       └── ConfigurationService.ts # Settings and configuration
├── images/
│   └── robot.png                 # Extension icon
├── .vscode/
│   ├── launch.json              # Debug configuration
│   └── tasks.json               # Build tasks
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

### Building and Testing

```bash
# Watch mode for development
npm run watch

# Compile for production
npm run compile

# Run linting
npm run lint

# Package extension
vsce package
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Issues and Support

- **Bug Reports**: [GitHub Issues](https://github.com/JacobCromwell/vectasight/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/JacobCromwell/vectasight/issues)
- **Discussions**: [GitHub Discussions](https://github.com/JacobCromwell/vectasight/discussions)

## 🙏 Acknowledgments

- GitHub Copilot team for the Language Model API
- OpenAI for GPT-4o
- Anthropic for Claude 3.5 Sonnet
- Google for Gemini API
- VS Code team for the extensibility platform

## 📊 Roadmap

- [ ] Support for more AI models (Gemini Pro, Llama, etc.)
- [ ] Code diff visualization with syntax highlighting
- [ ] Export comparisons to files
- [ ] Custom prompt templates
- [ ] Batch comparison of multiple prompts
- [ ] Integration with version control
- [ ] Response caching for faster repeat queries
- [ ] Custom scoring algorithms for response quality
- [ ] Team sharing of comparison results

---

**Happy Comparing! 🚀**