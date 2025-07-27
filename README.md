# Files Tokenizer and Analyzer

A text analysis and tokenizer tool built with React, TypeScript, and Vite. It allows you to analyze text by calculating character count, word count, and token count using different tokenization methods. It also provides insights into word and token frequency.

> **Supports both GPT and Gemini/Gemma based tokenizer.**

**Check out: [https://tokenizer.twinql.ai/](https://tokenizer.twinql.ai/)**

## Features

*   **Text Input:** Paste text directly into the text area or upload files.
*   **File Upload:** Supports various file types, including:
    *   Plain text (`.txt`)
    *   Markdown (`.md`)
    *   Documents (`.docx`)
    *   Spreadsheets (`.xlsx`, `.xls`)
    *   Code files (`.js`, `.ts`, `.py`, `.java`, `.c`, etc.)
    *   And more! (See `ACCEPTED_EXTENSIONS` in `src/App.tsx`)
*   **Metrics:**
    *   Character Count
    *   Word Count
    *   Token Count
*   **Tokenizers:**
    *   **GPT Tokenizer:** Uses the `gpt-tokenizer` library for fast, local tokenization based on `gpt-4o` model.
    *   **Gemini Tokenizer:** Uses the Google Generative AI API (`@google/genai`) to count tokens based on `gemini-2.5-flash` model. Requires a Google AI API key.
*   **Frequency Analysis:**
    *   Displays the top 10 most frequent words in the input text.
    *   Displays the top 10 most frequent GPT tokens (when the GPT tokenizer is selected).

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
3.  **Set up API Key (Optional for Gemini):**
    *   If you want to use the Gemini tokenizer, obtain an API key from [Google AI Studio](https://aistudio.google.com/).
    *   The application will prompt you to enter the API key when you select the Gemini tokenizer. **It will be stored locally in your browser**.
4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
5.  Open your browser and navigate to the local development URL (usually `http://localhost:5173`).

## Contributing

We are actively looking for contributions! They are heartily welcome! Please feel free to submit issues or pull requests.

## Thanks

- Thanks to @niieani for his amazing lib [https://github.com/niieani/gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)

## TODO (help please!)

- [ ] Better and organized UI
- [ ] Add claude tokenizer support
- [ ] Input/Output Pricing for each model
- [ ] Multi-file uploads
- [ ] Image token counting (from upload and screenshot)
- [ ] Better text analysis and recommendations to reduce token usage
- [ ] Automatic token minification