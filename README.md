# Files Tokenizer and Analyzer

A tokenizer tool built with React, TypeScript, and Vite. Analyze text across multiple AI providers with real-time token counting, cost calculation, and advanced visualization features.

> **Supports OpenAI, Anthropic, and Google AI tokenizers with cost estimation.**

**Check out: [https://tokenizer.twinql.ai/](https://tokenizer.twinql.ai/)**

## Features

### 🔤 **Text Analysis**
*   **Text Input:** Paste text directly or upload multiple files simultaneously
*   **Real-time Metrics:** Character count, word count, and token count
*   **Frequency Analysis:** Top 10 most frequent words and tokens with interactive charts

### 🤖 **Multi-Provider Support**
*   **OpenAI:** Real-time tokenization with models like GPT-4o, o1, o3, o4-mini
*   **Anthropic:** API-based counting for Claude Sonnet 4, Claude Opus 4, Claude 3.5 models
*   **Google:** Gemini 2.5 Flash, Gemini 2.0 Flash, and Gemini 2.5 Pro support

### 💰 **Cost Calculation**
*   **Real-time Pricing:** Input/output cost estimation for all supported models
*   **Multi-Currency:** USD and INR support with live exchange rates
*   **Per-File Breakdown:** Individual token and cost analysis for attached files

### 📁 **Advanced File Support**
*   **Text Files:** `.txt`, `.md`, `.csv`, `.html`, `.css`
*   **Code Files:** `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.py`, `.java`, `.c`, `.cpp`, `.go`, `.rs`
*   **Documents:** `.docx`, `.pdf` with full text extraction
*   **Spreadsheets:** `.xlsx`, `.xls` with data parsing
*   **Multi-file Upload:** Attach and analyze multiple files with individual token tracking

### 🎨 **Visualization & UI**
*   **Token Visualization:** Color-coded token display with virtualization for large texts
*   **Interactive Charts:** Word and token frequency analysis with responsive charts
*   **Dark/Light Mode:** Toggle between themes
*   **Token/ID Toggle:** View actual tokens or their numeric IDs (OpenAI models)

### ⚡ **User Experience**
*   **Keyboard Shortcuts:** `Ctrl/Cmd + Enter` for quick token calculation
*   **Local Storage:** API keys and preferences saved locally
*   **Responsive Design:** Works across desktop and mobile devices
*   **Real-time Updates:** Instant recalculation for OpenAI models

## Local Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd tokenizer
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Set up API Keys:**
    *   **Anthropic:** Obtain API key from [Anthropic Console](https://console.anthropic.com/)
    *   **Google:** Obtain API key from [Google AI Studio](https://aistudio.google.com/)
    *   API keys are stored locally in your browser for security

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
5.  Open your browser and navigate to the local development URL (usually `http://localhost:5173`).

## Security

> **No** data leaves your browser.

## Contributing

We are actively looking for contributions! They are heartily welcome! Please feel free to submit issues or pull requests.

## Thanks

- Thanks to @niieani for his amazing lib [https://github.com/niieani/gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)

## TODO (help please!)

- [x] ~~Better and organized UI~~
- [x] ~~Add claude tokenizer support~~
- [x] ~~Input/Output Pricing for each model~~
- [x] ~~Multi-file uploads~~
- [x] ~~Image token counting (from upload and screenshot)~~
- [ ] Better text analysis and recommendations to reduce token usage
- [ ] Automatic token minification