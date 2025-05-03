import { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import { encode as gptEncode, decode as gptDecode } from 'gpt-tokenizer'; // Use the specific encode function
import { GoogleGenAI } from '@google/genai';
import * as mammoth from 'mammoth'; // For .docx parsing
import * as XLSX from 'xlsx'; // Use namespace import with 'xlsx' package name
import * as pdfjsLib from 'pdfjs-dist';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

// Define extensions
const ACCEPTED_EXTENSIONS = [
    '.txt', '.md', '.csv', '.html', '.css', '.js', '.jsx', '.ts', '.tsx',
    '.json', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs',
    '.docx', '.xlsx', '.xls', '.pdf'
];
const ACCEPT_STRING = [...ACCEPTED_EXTENSIONS].join(',');

type FrequencyItem = { item: string; count: number };
type TokenizerType = 'gpt' | 'gemini';

// Simple debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Configure pdf.js worker source to load from the public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

function App() {
  const [text, setText] = useState<string>('');
  const [tokenCount, setTokenCount] = useState<number | string>(0); // Can be 'Calculating...'
  const [wordCount, setWordCount] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  const [tokenizerType, setTokenizerType] = useState<TokenizerType>('gpt');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || ''); // Load from local storage
  const [isCounting, setIsCounting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [frequencyData, setFrequencyData] = useState<FrequencyItem[]>([]);
  const [gptTokenFrequencyData, setGptTokenFrequencyData] = useState<FrequencyItem[]>([]); // Added state for GPT token frequency

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store API key in local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('geminiApiKey', apiKey);
  }, [apiKey]);

  // Debounced function for Gemini token counting
  const debouncedCountGeminiTokens = useCallback(debounce(async (inputText: string, key: string) => {
      if (!key) {
          setError('API key is required for Gemini tokenizer.');
          setTokenCount(0);
          setIsCounting(false);
          return;
      }
      if (!inputText.trim()) {
           setTokenCount(0);
           setIsCounting(false);
           setError('');
           return;
      }

      setIsCounting(true);
      setError('');
      setTokenCount('...'); // Indicate calculation

      try {
          const genAI = new GoogleGenAI({ apiKey: key });

          // Basic request structure for countTokens
          const req = {
              contents: [{ parts: [{ text: inputText }] }],
          };

          // Call countTokens directly on the models property
          const result = await genAI.models.countTokens({
              model: "gemini-2.0-flash", // Specify model here
              ...req // Spread the contents request
          });

          setTokenCount(result.totalTokens ?? 0); // Use nullish coalescing for default value
      } catch (err: any) {
          console.error("Error counting Gemini tokens:", err);
          setError(`Gemini API Error: ${err.message || 'Failed to count tokens. Check API key and console.'}`);
          setTokenCount('Error');
      } finally {
          setIsCounting(false);
      }
  }, 500), [apiKey]); // Debounce API calls, depends on apiKey

  // Function to calculate word frequency (used as fallback for Gemini)
  const calculateWordFrequency = (inputText: string): FrequencyItem[] => {
      if (!inputText.trim()) {
          return [];
      }
      const words = inputText
          .toLowerCase() // Normalize to lowercase
          .match(/[\p{L}\p{N}]+/gu) || []; // Match sequences of letters/numbers

      const frequencyMap: { [key: string]: number } = {};
      words.forEach(word => {
          frequencyMap[word] = (frequencyMap[word] || 0) + 1;
      });

      const sortedFrequency = Object.entries(frequencyMap)
          .map(([word, count]) => ({ item: word, count }))
          .sort((a, b) => b.count - a.count); // Sort descending by count

      return sortedFrequency.slice(0, 10); // Already in the correct { item: string, count: number } format
  };

  // Function to calculate GPT token frequency
  const calculateGptTokenFrequency = (inputText: string): FrequencyItem[] => {
      if (!inputText.trim()) {
          return [];
      }
      try {
          const tokens = gptEncode(inputText);
          const frequencyMap: { [key: number]: number } = {};
          tokens.forEach(token => {
              frequencyMap[token] = (frequencyMap[token] || 0) + 1;
          });

          const sortedFrequency = Object.entries(frequencyMap)
              .sort(([, countA], [, countB]) => countB - countA) // Sort descending by count
              .slice(0, 30); // Get top 30 potential [tokenId, count] pairs

          const ignoredTokens = new Set(['␣', '.', '-', '[Whitespace]']); // Tokens to filter out

          // Decode token IDs to strings for display
          const decodedFrequency: FrequencyItem[] = sortedFrequency.map(([tokenIdStr, count]) => {
              const tokenId = parseInt(tokenIdStr, 10);
              let decodedItem = '[Unknown Token]'; // Fallback
              try {
                  decodedItem = gptDecode([tokenId]);
              } catch (decodeError) {
                  console.error(`Failed to decode token ID ${tokenId}:`, decodeError);
              }
              // Replace potential non-printable characters for display
              // Using a simple replacement for common whitespace, might need refinement
              decodedItem = decodedItem.replace(/\s/g, '␣'); // Represent space as ␣
              if (!decodedItem.trim()) decodedItem = '[Whitespace]'; // Label empty/whitespace tokens

              return { item: decodedItem, count };
          });

          // Filter out ignored tokens and take the top 10
          const filteredFrequency = decodedFrequency
              .filter(item => !ignoredTokens.has(item.item))
              .slice(0, 10);

          return filteredFrequency;
      } catch (err) {
          console.error("Error calculating GPT token frequency:", err);
          setError('Error processing text for token frequency.');
          return [];
      }
  };

  useEffect(() => {
    // Calculate character count
    const chars = text.length;
    setCharCount(chars);

    // Calculate word count (simple split by space/newline/punctuation)
    const words = text.trim().split(/[\s\p{P}]+/u).filter(Boolean);
    setWordCount(words.length === 1 && words[0] === '' ? 0 : words.length);

    // Calculate token count based on selected tokenizer
    if (isProcessingFile) return; // Don't count tokens while file is being processed

    setError(''); // Clear previous errors

    // Always calculate word frequency
    const wordFreq = calculateWordFrequency(text);
    setFrequencyData(wordFreq);

    if (tokenizerType === 'gpt') {
      setIsCounting(true); // Indicate processing
      setGptTokenFrequencyData([]); // Clear previous token freq
      try {
        const tokens = gptEncode(text);
        setTokenCount(tokens.length);
        // Calculate and set GPT token frequency
        const tokenFreq = calculateGptTokenFrequency(text);
        setGptTokenFrequencyData(tokenFreq);
      } catch (err) {
        console.error("Error encoding text or calculating GPT token frequency:", err);
        setError('Error processing text with GPT tokenizer.');
        setTokenCount('Error');
        setGptTokenFrequencyData([]); // Clear on error
      } finally {
        setIsCounting(false);
      }
    } else if (tokenizerType === 'gemini') {
       setGptTokenFrequencyData([]); // Clear token frequency when Gemini is selected
       // Trigger debounced Gemini count (word freq already calculated above)
       debouncedCountGeminiTokens(text, apiKey);
    }

  }, [text, tokenizerType, apiKey, debouncedCountGeminiTokens, isProcessingFile]); // Add isProcessingFile dependency

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setFileName(''); // Clear file name when typing manually
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset file input value immediately
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    if (!file) {
        setFileName('');
        setText('');
        setError('');
        return;
    }

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAcceptedExtension = ACCEPTED_EXTENSIONS.includes(fileExtension);

    if (!isAcceptedExtension) {
         alert(`File type ("${fileExtension}") is not supported. Please upload a supported text-based file, .docx, .xlsx, .xls, or .pdf.`);
         setFileName('');
         setText('');
         setError(`Unsupported file type: ${file.name}`);
         return;
    }

    setFileName(file.name);
    setText(''); // Clear previous text
    setError('');
    setIsProcessingFile(true);
    setTokenCount(0); // Reset counts
    setWordCount(0);
    setCharCount(0);

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const fileContent = e.target?.result;
            let extractedText = '';

            if (fileExtension === '.docx') {
                if (fileContent instanceof ArrayBuffer) {
                    const result = await mammoth.extractRawText({ arrayBuffer: fileContent });
                    extractedText = result.value;
                } else {
                    throw new Error('Failed to read .docx file as ArrayBuffer');
                }
            } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
                 if (fileContent instanceof ArrayBuffer) {
                    const workbook = XLSX.read(new Uint8Array(fileContent), { type: 'array' });
                    let fullText = '';
                    workbook.SheetNames.forEach((sheetName: string) => {
                        const worksheet = workbook.Sheets[sheetName];
                        // Use sheet_to_json with header: 1 for array of arrays, then join rows/cells
                        const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                        sheetData.forEach(row => {
                             fullText += row.join(' ') + '\n'; // Join cells with space, rows with newline
                        });
                        fullText += '\n'; // Add extra newline between sheets
                    });
                    extractedText = fullText.trim();
                } else {
                     throw new Error('Failed to read Excel file as ArrayBuffer');
                }
            } else if (fileExtension === '.pdf') {
                 if (fileContent instanceof ArrayBuffer) {
                     const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileContent) }).promise;
                     let fullText = '';
                     for (let i = 1; i <= pdf.numPages; i++) {
                         const page = await pdf.getPage(i);
                         const textContent = await page.getTextContent();
                         // Filter out potential undefined items and join
                         const pageText = textContent.items
                             .map(item => ('str' in item ? item.str : ''))
                             .join(' ');
                         fullText += pageText + '\n'; // Add page text with a newline separator
                     }
                     extractedText = fullText.trim();
                 } else {
                     throw new Error('Failed to read PDF file as ArrayBuffer');
                 }
            } else {
                // Handle standard text files (already read as text)
                if (typeof fileContent === 'string') {
                    extractedText = fileContent;
                } else {
                     throw new Error('Failed to read text file as string');
                }
            }

            setText(extractedText);
        } catch (err: any) {
            console.error("Error processing file:", err);
            setError(`Failed to process file "${file.name}": ${err.message || 'Unknown error'}`);
            setText(''); // Clear text on error
            setFileName(''); // Clear filename on error
        } finally {
            setIsProcessingFile(false);
        }
    };

    reader.onerror = (e) => {
        console.error("Error reading file:", e);
        alert(`Error reading file "${file.name}".`);
        setFileName('');
        setText('');
        setError(`Failed to read file: ${file.name}`);
        setIsProcessingFile(false);
    };

    // Read as ArrayBuffer for Office formats AND PDFs, otherwise read as text
    if (fileExtension === '.docx' || fileExtension === '.xlsx' || fileExtension === '.xls' || fileExtension === '.pdf') {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
  };

  // Handle clicks on the custom label to trigger the hidden file input
  const handleLabelClick = (event: React.MouseEvent<HTMLLabelElement>) => {
      event.preventDefault(); // Prevent the default label behavior
      fileInputRef.current?.click(); // Trigger the hidden input click
  };

  const handleTokenizerChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTokenizerType(event.target.value as TokenizerType);
    // Reset count immediately when switching
    setTokenCount(0);
    setError('');
  };

   const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
     // Trigger recount if API key changes and Gemini is selected
    // Also recalculate word frequency for Gemini when key changes (as count is triggered)
    if (tokenizerType === 'gemini') {
       const wordFreq = calculateWordFrequency(text);
       setFrequencyData(wordFreq);
       debouncedCountGeminiTokens(text, event.target.value);
    }
  };

  // === Word Frequency Chart ===
  const wordChartData = {
      labels: frequencyData.map(item => item.item),
      datasets: [
          {
              label: 'Word Frequency',
              data: frequencyData.map(item => item.count),
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
          },
      ],
  };

  const wordChartOptions = {
      indexAxis: 'y' as const,
      elements: {
          bar: {
              borderWidth: 2,
          },
      },
      responsive: true,
      plugins: {
          legend: {
              display: false, // Keep it cleaner, title is enough
          },
          title: {
              display: true,
              text: `Top 10 Most Frequent Words`,
              color: '#e0e0e0' // Light color for title
          },
          tooltip: {
              backgroundColor: '#333', // Dark background for tooltip
              titleColor: '#fff',
              bodyColor: '#eee',
              callbacks: {
                  label: function(context: any) {
                      let label = context.dataset.label || 'Word';
                      if (label) { label += ': '; }
                      if (context.parsed.x !== null) { label += context.parsed.x; }
                      return label;
                  }
              }
          }
      },
       scales: {
          x: {
              beginAtZero: true,
              title: {
                  display: true,
                  text: 'Count',
                  color: '#bbbbbb' // Light color for axis title
              },
              ticks: { color: '#bbbbbb' }, // Light color for axis labels
              grid: { color: '#444' }     // Darker grid lines
          },
          y: {
               title: {
                   display: true,
                   text: 'Word',
                   color: '#bbbbbb' // Light color for axis title
               },
               ticks: { color: '#bbbbbb' }, // Light color for axis labels
               grid: { color: '#444' }    // Darker grid lines
          }
      },
      maintainAspectRatio: false
  };

  // === GPT Token Frequency Chart ===
  const gptTokenChartData = {
      labels: gptTokenFrequencyData.map(item => item.item),
      datasets: [
          {
              label: 'GPT Token Frequency',
              data: gptTokenFrequencyData.map(item => item.count),
              backgroundColor: 'rgba(255, 99, 132, 0.6)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1,
          },
      ],
  };

   const gptTokenChartOptions = {
      indexAxis: 'y' as const,
      elements: {
          bar: {
              borderWidth: 2,
          },
      },
      responsive: true,
      plugins: {
          legend: {
              display: false,
          },
          title: {
              display: true,
              text: `Top 10 Most Frequent GPT Tokens`,
              color: '#e0e0e0' // Light color for title
          },
          tooltip: {
              backgroundColor: '#333', // Dark background for tooltip
              titleColor: '#fff',
              bodyColor: '#eee',
              callbacks: {
                  label: function(context: any) {
                      let label = context.dataset.label || 'Token';
                      if (label) { label += ': '; }
                      if (context.parsed.x !== null) { label += context.parsed.x; }
                      return label;
                  }
              }
          }
      },
       scales: {
          x: {
              beginAtZero: true,
              title: {
                  display: true,
                  text: 'Count',
                  color: '#bbbbbb' // Light color for axis title
              },
              ticks: { color: '#bbbbbb' }, // Light color for axis labels
              grid: { color: '#444' }     // Darker grid lines
          },
          y: {
               title: {
                   display: true,
                   text: 'GPT Token',
                   color: '#bbbbbb' // Light color for axis title
               },
               ticks: { color: '#bbbbbb' }, // Light color for axis labels
               grid: { color: '#444' }     // Darker grid lines
          }
      },
      maintainAspectRatio: false
  };

  return (
    <div className="app-container">
      <h1>Tokens Analyzer {isProcessingFile && <span className="processing-indicator">(Processing file...)</span>}</h1>

      <div className="input-area">
        <textarea
          placeholder="Paste your text here or upload a supported file..."
          value={text}
          onChange={handleTextChange}
          rows={10} // Suggest a starting size
        />
        <div className="controls-container">
            <div className="file-input-container">
            {/* Hidden actual file input */}
            <input
                type="file"
                accept={ACCEPT_STRING} // Use the generated accept string
                onChange={handleFileChange}
                className="file-input"
                ref={fileInputRef}
                id="file-upload" // Add id for the label's htmlFor
            />
            {/* Custom styled button/label - Pass event to handler */}
            <label htmlFor="file-upload" className="file-upload-label" onClick={handleLabelClick}>
                Upload File
            </label>
            {fileName && <span className="file-name">Loaded: {fileName}</span>}
            </div>

            <div className="tokenizer-select-container">
                <label htmlFor="tokenizer-select">Tokenizer:</label>
                <select id="tokenizer-select" value={tokenizerType} onChange={handleTokenizerChange}>
                    <option value="gpt">GPT (OpenAI)</option>
                    <option value="gemini">Gemini (Google)</option>
                </select>
            </div>
        </div>
         {tokenizerType === 'gemini' && (
            <div className="api-key-container">
                <label htmlFor="api-key-input">Gemini API Key:</label>
                <input
                    id="api-key-input"
                    type="password"
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your Google AI API Key"
                    aria-label="Gemini API Key Input"
                />
            </div>
        )}
         <p className="disclaimer">
            Supports plain text, markdown, code files, .docx, .xlsx, .xls, .pdf (basic text extraction).
            Word/token counts are approximate.
            {tokenizerType === 'gemini' && ' Gemini token counting requires an API key and makes network requests.'}
            {tokenizerType === 'gpt' && ' Common tokens (whitespace, periods, dashes) are excluded from the GPT token frequency chart.'}
         </p>
         {error && <p className="error-message">Error: {error}</p>}
      </div>


      <div className="counts-display">
        <div className="count-box">
          <h2>{(isCounting && tokenizerType === 'gemini') || isProcessingFile ? <div className="spinner"></div> : tokenCount}</h2>
          <p>Tokens ({tokenizerType === 'gpt' ? 'GPT' : 'Gemini'})</p>
        </div>
        <div className="count-box">
          <h2>{wordCount}</h2>
          <p>Words</p>
        </div>
        <div className="count-box">
          <h2>{charCount}</h2>
          <p>Characters</p>
        </div>
      </div>

       {/* Charts Display Area */}
       <div className="charts-container">
           {frequencyData.length > 0 && (
               <div className="chart-wrapper word-chart">
                   <Bar options={wordChartOptions} data={wordChartData} />
               </div>
           )}
           {tokenizerType === 'gpt' && gptTokenFrequencyData.length > 0 && (
               <div className="chart-wrapper token-chart">
                   <Bar options={gptTokenChartOptions} data={gptTokenChartData} />
               </div>
           )}
       </div>

    </div>
  );
}

export default App;
