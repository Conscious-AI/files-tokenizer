import React, { useState, useEffect, useMemo, useCallback, ChangeEvent, useRef } from "react";
import { FixedSizeList as List } from "react-window";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ReTooltip,
    ResponsiveContainer,
} from "recharts";
import { setMergeCacheSize } from "gpt-tokenizer";
import { encode as encode_o200k_base, decode as decode_o200k_base } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encode_cl100k_base, decode as decode_cl100k_base } from "gpt-tokenizer/encoding/cl100k_base";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

// pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

// Set to 1M entries
setMergeCacheSize(1000000)

// --- Types & Constants ----------------------------------------------------

const ACCEPTED_EXTENSIONS = [
    ".txt",
    ".md",
    ".csv",
    ".html",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".docx",
    ".xlsx",
    ".xls",
    ".pdf",
];
const ACCEPT_STRING = [...ACCEPTED_EXTENSIONS].join(",");

const PROVIDERS = ["OpenAI", "Anthropic", "Google"] as const;

type Provider = (typeof PROVIDERS)[number];

const MODELS_CONFIG: Record<Provider, Record<string, { input: number; output: number }>> = {
    OpenAI: {
        "o4-mini": { input: 0.0000011, output: 0.0000044 }, // $1.1/$4.40 per million
        "o3": { input: 0.000002, output: 0.000008 }, // $2/$8 per million
        "o1": { input: 0.000015, output: 0.00006 }, // $15/$60 per million
        "gpt-4o": { input: 0.0000025, output: 0.00001 }, // $2.5/$10 per million
        "gpt-4.1": { input: 0.000002, output: 0.000008 }, // $2/$8 per million
        "gpt-4": { input: 0.00003, output: 0.00006 }, // $30/$60 per million
        "gpt3.5": { input: 0.0000005, output: 0.0000015 }, // $0.50/$1.50 per million
        "gpt3": { input: 0.000002, output: 0.000002 }, // Legacy GPT-3
    },
    Anthropic: {
        "claude-opus-4-20250514": { input: 0.000015, output: 0.000075 }, // $15/$75 per million
        "claude-sonnet-4-20250514": { input: 0.000003, output: 0.000015 }, // $3/$15 per million
        "claude-3-7-sonnet-latest": { input: 0.000003, output: 0.000015 }, // $3/$15 per million
        "claude-3-5-sonnet-latest": { input: 0.000003, output: 0.000015 }, // $3/$15 per million
        "claude-3-5-haiku-latest": { input: 0.0000008, output: 0.000004 }, // $0.8/$4.0 per million
    },
    Google: {
        "gemini-2.0-flash": { input: 0.0000001, output: 0.0000004 }, // $0.1/$0.4 per million
        "gemini-2.5-flash": { input: 0.0000003, output: 0.0000025 }, // $0.3/$2.5 per million
        "gemini-2.5-pro": { input: 0.00000125, output: 0.00001 }, // $1.25/$10.00 per million (<=200k tokens)
    },
};

const USD_TO_INR = 83; // approximate conversion

const pastelColors = [
    "rgba(107,64,216,.3)",
    "rgba(76, 244, 101, 0.4)",
    "rgba(244,172,54,.4)",
    "rgba(239,65,70,.4)",
    "rgba(39,181,234,.4)",
];

// --- Utility functions ----------------------------------------------------

const formatNumber = (val: number | string): string => {
    if (typeof val !== "number") return String(val);
    return val.toLocaleString();
};

const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number,
) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// --- Tokenizer functions --------------------------------------------------

const getEncodingForModel = (model: string): "o200k_base" | "cl100k_base" => {
    // o-series models, like o1-*, o3-* and o4-mini use o200k_base
    if (model.startsWith("o1") || model.startsWith("o3") || model === "o4-mini") {
        return "o200k_base";
    }
    // gpt-4o uses o200k_base
    if (model === "gpt-4o") {
        return "o200k_base";
    }
    // gpt-4-* and gpt-3.5-* use cl100k_base
    if (model.startsWith("gpt-4") || model.startsWith("gpt3.5") || model.startsWith("gpt3")) {
        return "cl100k_base";
    }
    // Default to cl100k_base
    return "cl100k_base";
};

const gptEncode = (text: string, model: string): number[] => {
    const encoding = getEncodingForModel(model);
    if (encoding === "o200k_base") {
        return encode_o200k_base(text);
    } else {
        return encode_cl100k_base(text);
    }
};

const gptDecode = (tokens: number[], model: string): string => {
    const encoding = getEncodingForModel(model);
    if (encoding === "o200k_base") {
        return decode_o200k_base(tokens);
    } else {
        return decode_cl100k_base(tokens);
    }
};

// --- Components ----------------------------------------------------------

function WordFrequencyChart({ data }: { data: { item: string; count: number }[] }) {
    if (!data || data.length === 0)
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Word frequency data unavailable.
            </div>
        );
    const chartData = data.map((d) => ({ name: d.item, count: d.count }));
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={chartData} layout="vertical" margin={{ left: 24, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "currentColor" }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "currentColor" }} width={100} />
                <ReTooltip wrapperClassName="text-sm" cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="count" fill="rgba(88,166,255,0.8)" />
            </ReBarChart>
        </ResponsiveContainer>
    );
}

function TokenFrequencyChart({ data }: { data: { item: string; count: number }[] }) {
    if (!data || data.length === 0)
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Token frequency data not available.
            </div>
        );
    const chartData = data.map((d) => ({ name: d.item, count: d.count }));
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={chartData} layout="vertical" margin={{ left: 24, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "currentColor" }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "currentColor" }} width={120} />
                <ReTooltip wrapperClassName="text-sm" cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="count" fill="rgba(255,99,132,0.8)" />
            </ReBarChart>
        </ResponsiveContainer>
    );
}

const monospace = `"Roboto Mono",sfmono-regular,consolas,liberation mono,menlo,courier,monospace`;

// Line-based virtualization to avoid overlapping and keep structure ---------------------------------

interface LineRowProps {
    index: number;
    style: React.CSSProperties;
    data: {
        lines: string[][];
        showIds: boolean;
    };
}

const LineRow = React.memo(({ index, style, data }: LineRowProps) => {
    const { lines, showIds } = data;
    const line = lines[index];
    if (!line) return null;

    return (
        <div style={style} className="flex items-center px-2 whitespace-nowrap">
            {line.map((token, idx) => {
                const tokenStr = String(token);
                const isNewline = tokenStr === "↵";
                return (
                    <span
                        key={idx}
                        className="inline-block"
                        style={{
                            backgroundColor: isNewline ? "#ff6b6b40" : pastelColors[(index + idx) % pastelColors.length],
                            border: isNewline ? "1px dashed #ff6b6b" : "none",
                            padding: "0",
                            marginRight: "1px",
                            height: "1.5em",
                            minWidth: isNewline ? "20px" : "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: isNewline ? "center" : "flex-start",
                        }}
                    >
                        <pre className="text-xs px-0.5" style={{ margin: 0 }}>
                            {isNewline
                                ? "↵"
                                : showIds
                                ? tokenStr
                                : tokenStr.replace(/ /g, "\u00A0")}
                        </pre>
                    </span>
                );
            })}
        </div>
    );
});

function TokenizedText({ tokens, showIds, model }: { tokens: (string | number)[]; showIds: boolean; model: string }) {
    // Split tokens into lines preserving newlines
    const lines = useMemo(() => {
        const result: string[][] = [[]];
        tokens.forEach((tok) => {
            const decodedStr = showIds ? gptDecode([Number(tok)], model) : String(tok);
            const parts = decodedStr.split('\n');
            parts.forEach((part, idx) => {
                if (part || (idx > 0 && parts.length > 1)) { // Push even if empty for continued lines
                    const toPush = showIds
                        ? (idx === 0 ? String(tok) : `[cont ${tok}]`)
                        : part;
                    result[result.length - 1].push(toPush);
                }
                if (idx < parts.length - 1) {
                    result[result.length - 1].push('↵');
                    result.push([]);
                }
            });
        });
        return result;
    }, [tokens, showIds, model]);

    const itemData = useMemo(() => ({ lines, showIds }), [lines, showIds]);

    if (tokens.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No tokens to display
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto" style={{ fontFamily: monospace }}>
            <List
                height={400}
                width={9999}
                itemCount={lines.length}
                itemSize={24} // height per line
                itemData={itemData}
            >
                {LineRow}
            </List>
        </div>
    );
}
// --- Main Component ------------------------------------------------------

export default function TokenAnalyzer() {
    const [text, setText] = useState<string>("");
    const [provider, setProvider] = useState<Provider>("OpenAI");
    const [model, setModel] = useState<string>(Object.keys(MODELS_CONFIG["OpenAI"])[0]);
    const [tokenCount, setTokenCount] = useState<number | string>(0);
    const [wordCount, setWordCount] = useState<number>(0);
    const [charCount, setCharCount] = useState<number>(0);
    const [wordFreqData, setWordFreqData] = useState<{ item: string; count: number }[]>([]);
    const [tokenFreqData, setTokenFreqData] = useState<{ item: string; count: number }[]>([]);
    const [currency, setCurrency] = useState<"USD" | "INR">("USD");
    const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem("apiKey") || "");
    const [error, setError] = useState<string>("");
    const [, setIsCounting] = useState<boolean>(false);
    const [isCalculating, setIsCalculating] = useState<boolean>(false);
    const [needsRecalculation, setNeedsRecalculation] = useState<boolean>(false);

    const [outputMode, setOutputMode] = useState<"tokens" | "ids">("tokens");
    // Track uploaded files with their content and token counts
    const [attachments, setAttachments] = useState<{ name: string; content: string; tokens: number | null }[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Persist API key
    useEffect(() => {
        localStorage.setItem("apiKey", apiKey);
    }, [apiKey]);

    // Keyboard shortcut for calculation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toLowerCase().includes('mac');
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (isCtrlOrCmd && e.key === 'Enter' && !isCalculating && apiKey && needsRecalculation && (text.trim() || attachments.length > 0)) {
                e.preventDefault();
                if (provider === "Anthropic") {
                    calculateAnthropicTokens();
                } else if (provider === "Google") {
                    calculateGeminiTokens();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [provider, isCalculating, apiKey, needsRecalculation, text, attachments.length]);

    // --- Helper calculations ------------------------------------------------

    // For display purposes - show all text tokens
    const displayTokens = useMemo<number[]>(() => {
        if (provider === "Google") return []; // handled separately
        try {
            return gptEncode(text, model);
        } catch (e) {
            return [];
        }
    }, [text, provider, model]);

    // NOTE: manualTextTokens logic removed – we count the whole text to avoid double counting with attachments

    const decodedTokens = useMemo<string[]>(() => {
        if (provider === "Google") return [];
        try {
            return displayTokens.map(token => {
                try {
                    return gptDecode([token], model);
                } catch {
                    return "[Unknown]";
                }
            });
        } catch (e) {
            return [];
        }
    }, [displayTokens, provider, model]);

    const calculateWordFrequency = useCallback((input: string) => {
        if (!input.trim()) return [] as { item: string; count: number }[];
        const words = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
        const map: Record<string, number> = {};
        words.forEach((w) => (map[w] = (map[w] || 0) + 1));
        return Object.entries(map)
            .map(([word, count]) => ({ item: word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, []);

    const calculateGptTokenFrequency = useCallback((input: string) => {
        if (!input.trim()) return [] as { item: string; count: number }[];
        try {
            const tokens = gptEncode(input, model);
            const map: Record<number, number> = {};
            tokens.forEach((t) => (map[t] = (map[t] || 0) + 1));
            const sorted = Object.entries(map)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 30);
            const ignored = new Set(["␣", ".", "-", "[Whitespace]"]);
            const decoded = sorted
                .map(([idStr, count]) => {
                    const id = parseInt(idStr, 10);
                    try {
                        let decodedItem = gptDecode([id], model).replace(/\s/g, "␣");
                        if (!decodedItem.trim()) decodedItem = "[Whitespace]";
                        return { item: decodedItem, count };
                    } catch {
                        return { item: "[Unknown]", count };
                    }
                })
                .filter((item) => !ignored.has(item.item))
                .slice(0, 10);
            return decoded;
        } catch {
            return [];
        }
    }, [model]);





    // Main effect - counts and frequencies
    useEffect(() => {
        setCharCount(text.length);
        const words = text.trim().split(/[\s\p{P}]+/u).filter(Boolean);
        setWordCount(words.length === 1 && words[0] === "" ? 0 : words.length);

        setWordFreqData(calculateWordFrequency(text));

        if (provider === "Google" || provider === "Anthropic") {
            // Only reset when a (re)calculation is required
            if (needsRecalculation) {
                setTokenCount(0);
                setTokenFreqData([]);
            }
        } else {
            // For OpenAI, calculate tokens for attachments (for sidebar display) automatically
            const updatedAttachments = attachments.map(attachment => {
                if (attachment.tokens === null) {
                    try {
                        const tokens = gptEncode(attachment.content, model);
                        return { ...attachment, tokens: tokens.length };
                    } catch {
                        return attachment;
                    }
                }
                return attachment;
            });
            
            // Update attachments if any were calculated
            if (updatedAttachments.some((att, idx) => att.tokens !== attachments[idx].tokens)) {
                setAttachments(updatedAttachments);
            }

            // Calculate total tokens from the full visible text only to avoid double counting when edits occur
            setTokenCount(displayTokens.length);
            setTokenFreqData(calculateGptTokenFrequency(text));
            setNeedsRecalculation(false);
        }
    }, [text, provider, apiKey, displayTokens.length, model, attachments, needsRecalculation]);

    // --- Cost ---------------------------------------------------------------
    const modelRates = MODELS_CONFIG[provider][model];
    const inputCostUSD = typeof tokenCount === "number" ? tokenCount * modelRates.input : 0;
    const outputCostUSD = typeof tokenCount === "number" ? tokenCount * modelRates.output : 0;
    const conversion = currency === "INR" ? USD_TO_INR : 1;
    const formattedInputCost = (inputCostUSD * conversion).toFixed(2);
    const formattedOutputCost = (outputCostUSD * conversion).toFixed(2);

    // --- Handlers -----------------------------------------------------------

    const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value);

    const handleProviderChange = (val: string) => {
        const prov = val as Provider;
        setProvider(prov);
        setModel(Object.keys(MODELS_CONFIG[prov])[0]);
        setError("");
        setTokenCount(0);
        // Reset attachment tokens when provider changes
        setAttachments(prev => prev.map(attachment => ({ ...attachment, tokens: null })));
        if (prov === "Google" || prov === "Anthropic") {
            setNeedsRecalculation(true);
        }
    };

    const handleModelChange = (val: string) => {
        setModel(val);
        // Reset token counts when model changes
        setAttachments(prev => prev.map(attachment => ({ ...attachment, tokens: null })));
        if (provider === "Google" || provider === "Anthropic") {
            setNeedsRecalculation(true);
        }
    };

    const handleCurrencyToggle = (curr: "USD" | "INR") => setCurrency(curr);

    // Calculate tokens using Anthropic API
    const calculateAnthropicTokens = async () => {
        if (!apiKey) {
            setError("API key required for Anthropic token counting");
            return;
        }

        setIsCalculating(true);
        setError("");

        try {
            const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
            
            // Get the user's manually entered text (excluding file contents)
            let manualText = text;
            attachments.forEach(attachment => {
                // Remove each attachment's content from the text to get only manual input
                manualText = manualText.replace(attachment.content, '').trim();
            });

            // Calculate tokens for each attachment
            const updatedAttachments = await Promise.all(
                attachments.map(async (attachment) => {
                    try {
                        const response = await client.messages.countTokens({
                            model: model as any,
                            messages: [{ role: 'user', content: attachment.content }]
                        });
                        return { ...attachment, tokens: response.input_tokens };
                    } catch (err) {
                        console.error(`Error counting tokens for ${attachment.name}:`, err);
                        return attachment;
                    }
                })
            );

            // Calculate tokens for manual text if any
            let manualTextTokens = 0;
            if (manualText.trim()) {
                try {
                    const response = await client.messages.countTokens({
                        model: model as any,
                        messages: [{ role: 'user', content: manualText }]
                    });
                    manualTextTokens = response.input_tokens;
                } catch (err) {
                    console.error('Error counting tokens for manual text:', err);
                }
            }

            setAttachments(updatedAttachments);
            
            // Calculate total tokens from all sources
            const attachmentTokens = updatedAttachments.reduce((sum, att) => sum + (att.tokens || 0), 0);
            const totalTokens = attachmentTokens + manualTextTokens;
            setTokenCount(totalTokens);
            setNeedsRecalculation(false);
        } catch (err: any) {
            setError(err.message || "Anthropic API error");
        } finally {
            setIsCalculating(false);
        }
    };

    // Calculate tokens using Google Gemini API
    const calculateGeminiTokens = async () => {
        if (!apiKey) {
            setError("API key required for Gemini token counting");
            return;
        }

        setIsCalculating(true);
        setError("");

        try {
            const genAI = new GoogleGenAI({ apiKey });

            // Prepare Gemini model instance based on the user-selected model
            // The @google/genai typings may not include getGenerativeModel yet. Use a safe fallback.
            // @ts-ignore - dynamic access to potentially available method
            const geminiModel: any = (genAI as any).getGenerativeModel
                ? // @ts-ignore
                  (genAI as any).getGenerativeModel({ model })
                : {
                    // Fallback wrapper that proxies to the old models.countTokens method
                    countTokens: ({ contents }: { contents: any }) => (genAI as any).models.countTokens({ model, contents }),
                };

            // Utility to safely count tokens for a given content block
            const getTokenCount = async (content: string): Promise<number> => {
                try {
                    const resp: any = await geminiModel.countTokens({ contents: content });
                    // Different versions may use different field names
                    return resp.totalTokens ?? resp.total_tokens ?? 0;
                } catch (err) {
                    console.error('Gemini token count error:', err);
                    return 0;
                }
            };

            // Get the user's manually entered text (excluding file contents)
            let manualText = text;
            attachments.forEach(attachment => {
                manualText = manualText.replace(attachment.content, '').trim();
            });

            // Calculate tokens for each attachment
            const updatedAttachments = await Promise.all(
                attachments.map(async (attachment) => {
                    const tokens = await getTokenCount(attachment.content);
                    return { ...attachment, tokens };
                })
            );

            // Calculate tokens for the manual text if any
            const manualTextTokens = manualText.trim() ? await getTokenCount(manualText) : 0;

            setAttachments(updatedAttachments);
            
            // Calculate total tokens from all sources
            const attachmentTokens = updatedAttachments.reduce((sum, att) => sum + (att.tokens || 0), 0);
            const totalTokens = attachmentTokens + manualTextTokens;
            setTokenCount(totalTokens);
            setNeedsRecalculation(false);
        } catch (err: any) {
            setError(err.message || "Gemini API error");
        } finally {
            setIsCalculating(false);
        }
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!file) return;

        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
            alert(`Unsupported file type: ${ext}`);
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result;
                let extracted = "";

                if ([".docx"].includes(ext)) {
                    if (content instanceof ArrayBuffer) {
                        const res = await mammoth.extractRawText({ arrayBuffer: content });
                        extracted = res.value;
                    }
                } else if ([".xlsx", ".xls"].includes(ext)) {
                    if (content instanceof ArrayBuffer) {
                        const wb = XLSX.read(new Uint8Array(content), { type: "array" });
                        wb.SheetNames.forEach((sheet) => {
                            const data: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
                            data.forEach((row) => (extracted += row.join(" ") + "\n"));
                        });
                    }
                } else if (ext === ".pdf") {
                    if (content instanceof ArrayBuffer) {
                        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(content) }).promise;
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const txt = await page.getTextContent();
                            extracted += txt.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n";
                        }
                    }
                } else {
                    if (typeof content === "string") extracted = content;
                }

                const trimmed = extracted.trim();
                // Add attachment record with content (tokens will be calculated on button press)
                setAttachments((prev) => [...prev, { name: file.name, content: trimmed, tokens: null }]);
                // Append to existing text instead of replacing
                setText(prevText => {
                    const separator = prevText.trim() ? "\n\n" : "";
                    return prevText + separator + trimmed;
                });
                if (provider === "Google" || provider === "Anthropic") {
                    setNeedsRecalculation(true);
                }
            } catch (err: any) {
                setError(err.message || "File processing error");
            }
        };

        if ([".docx", ".xlsx", ".xls", ".pdf"].includes(ext)) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    };

    // --- JSX ---------------------------------------------------------------

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            {/* Header */}
            <header className="flex items-center justify-between gap-2 px-4 py-2 border-b">
                <div className="flex items-center gap-2">
                    <div className="text-xl">⭐</div>
                    <h1 className="text-lg font-semibold">Tokens Analyzer</h1>
                </div>
                <ModeToggle />
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <aside className="w-64 flex flex-col gap-4 border-r p-4 overflow-y-auto">
                    {/* Count */}
                    <Card className="bg-transparent rounded-none">
                        <CardHeader>
                            <CardTitle>Count</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {/* Tokens */}
                                <div className="flex flex-col items-center justify-center h-24 rounded-none border bg-gradient-to-br from-background to-muted p-2 relative">
                                    {isCalculating && (provider === "Google" || provider === "Anthropic") && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                                            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                    <div className="text-2xl font-semibold font-mono">
                                        {formatNumber(tokenCount)}
                                    </div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Tokens
                                    </div>
                                </div>
                                {/* Words */}
                                <div className="flex flex-col items-center justify-center h-24 rounded-none border bg-gradient-to-br from-background to-muted p-2">
                                    <div className="text-2xl font-semibold font-mono">
                                        {wordCount.toLocaleString()}
                                    </div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Words
                                    </div>
                                </div>
                                {/* Characters */}
                                <div className="flex flex-col items-center justify-center h-24 rounded-none border bg-gradient-to-br from-background to-muted p-2">
                                    <div className="text-2xl font-semibold font-mono">
                                        {charCount.toLocaleString()}
                                    </div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Characters
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cost */}
                    <Card className="bg-transparent rounded-none">
                        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                            <CardTitle className="text-base">Cost</CardTitle>
                            <div className="flex gap-1">
                                <Button
                                    size="sm"
                                    variant={currency === "USD" ? "default" : "outline"}
                                    onClick={() => handleCurrencyToggle("USD")}
                                    className="h-7 px-2 text-xs"
                                >
                                    $
                                </Button>
                                <Button
                                    size="sm"
                                    variant={currency === "INR" ? "default" : "outline"}
                                    onClick={() => handleCurrencyToggle("INR")}
                                    className="h-7 px-2 text-xs"
                                >
                                    ₹
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="-mt-4.5 p-3">
                            <div className="space-y-3">
                                {/* Input Cost */}
                                <div className="flex flex-col items-center justify-center h-20 rounded-none border bg-gradient-to-br from-background to-muted p-2">
                                    <div className="text-lg font-semibold font-mono">
                                        {currency === "USD" ? "$" : "₹"} {formattedInputCost}
                                    </div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Input
                                    </div>
                                </div>
                                {/* Output Cost */}
                                <div className="flex flex-col items-center justify-center h-20 rounded-none border bg-gradient-to-br from-background to-muted p-2">
                                    <div className="text-lg font-semibold font-mono">
                                        {currency === "USD" ? "$" : "₹"} {formattedOutputCost}
                                    </div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Output
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Calculate Button at bottom */}
                    {(provider === "Anthropic" || provider === "Google") && (
                        <Button
                            onClick={provider === "Anthropic" ? calculateAnthropicTokens : calculateGeminiTokens}
                            disabled={isCalculating || !apiKey || (!text.trim() && attachments.length === 0)}
                            className="w-full"
                            variant={needsRecalculation && apiKey && (text.trim() || attachments.length > 0) ? "default" : "outline"}
                        >
                            Calculate Tokens
                        </Button>
                    )}
                </aside>

                {/* Center Area */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {/* Graphs */}
                    <div className="flex flex-1 min-h-[220px] gap-4 p-4 overflow-hidden">
                        <Card className="flex-1 flex flex-col overflow-hidden bg-transparent rounded-none">
                            <CardHeader>
                                <CardTitle>Word Frequency</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-hidden">
                                <WordFrequencyChart data={wordFreqData} />
                            </CardContent>
                        </Card>
                        <Card className="flex-1 flex flex-col overflow-hidden bg-transparent rounded-none">
                            <CardHeader>
                                <CardTitle>Token Frequency</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-hidden">
                                {provider === "OpenAI" ? (
                                    <TokenFrequencyChart data={tokenFreqData} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        Token frequency is only available for OpenAI models.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* IO Row */}
                    <div className="flex flex-1 min-h-[400px] gap-4 p-4 overflow-hidden">
                        {/* Input */}
                        <Card className="flex-1 flex flex-col bg-transparent rounded-none">
                            <CardHeader>
                                <CardTitle>Input</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col gap-2">
                                <Textarea
                                    value={text}
                                    onChange={handleTextChange}
                                    placeholder="Paste or type your input text..."
                                    className="flex-1 min-h-0 overflow-y-auto resize-none !field-sizing-fixed"
                                />
                            </CardContent>
                        </Card>

                        {/* Output */}
                        <Card className="flex-1 flex flex-col bg-transparent rounded-none overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-shrink-0 pb-3">
                                <CardTitle className="text-base">Output</CardTitle>
                                {provider === "OpenAI" && (
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant={outputMode === "tokens" ? "default" : "outline"}
                                            onClick={() => setOutputMode("tokens")}
                                            className="h-7 px-2 text-xs"
                                        >
                                            Tokens
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={outputMode === "ids" ? "default" : "outline"}
                                            onClick={() => setOutputMode("ids")}
                                            className="h-7 px-2 text-xs"
                                        >
                                            IDs
                                        </Button>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="flex-1 overflow-hidden -mt-4.5">
                                {provider === "OpenAI" && (
                                    <div className="h-full overflow-hidden border rounded-md">
                                        <TokenizedText
                                            tokens={outputMode === "ids" ? displayTokens : decodedTokens}
                                            showIds={outputMode === "ids"}
                                            model={model}
                                        />
                                    </div>
                                )}
                                {(provider === "Anthropic" || provider === "Google") && (
                                    <div className="h-full flex items-center justify-center border rounded-md">
                                        <div className="text-muted-foreground text-sm text-center">
                                            Tokenized output display is only supported for OpenAI models.
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </main>

                {/* Right Sidebar */}
                <aside className="w-64 flex flex-col gap-4 border-l p-4 overflow-y-auto">
                    {/* Provider */}
                    <Card className="bg-transparent rounded-none">
                        <CardHeader>
                            <CardTitle>Provider</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Select value={provider} onValueChange={handleProviderChange}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDERS.map((p) => (
                                        <SelectItem value={p} key={p}>
                                            {p}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    {/* API Key */}
                    {provider !== "OpenAI" && (
                        <Card className="bg-transparent rounded-none">
                            <CardHeader>
                                <CardTitle>API Key</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="Enter API Key"
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Model */}
                    <Card className="bg-transparent rounded-none">
                        <CardHeader>
                            <CardTitle>Model</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Select value={model} onValueChange={handleModelChange}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.keys(MODELS_CONFIG[provider]).map((m) => (
                                        <SelectItem value={m} key={m}>
                                            {m}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    {/* Error */}
                    {error && (
                        <Card className="border-destructive text-destructive bg-transparent rounded-none">
                            <CardContent className="text-sm p-4">Error: {error}</CardContent>
                        </Card>
                    )}

                    {/* Files Attached */}
                    <Card className="bg-transparent rounded-none">
                        <CardHeader>
                            <CardTitle>Files Attached</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-3">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPT_STRING}
                                    className="hidden"
                                    onChange={handleFileChange}
                                    id="file-upload-hidden"
                                />
                                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    Attach File
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {attachments.map((attachment, index) => (
                                    <div key={index} className="flex items-center justify-between gap-2 border rounded-none p-2 relative">
                                        {isCalculating && attachment.tokens === null && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="text-sm font-medium truncate" title={attachment.name}>
                                                {attachment.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {attachment.tokens === null ? "Not calculated" : `${formatNumber(attachment.tokens)} tokens`}
                                            </div>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                                // Remove attachment and its content from text
                                                const attachmentToRemove = attachments[index];
                                                setAttachments((prev) => prev.filter((_, i) => i !== index));
                                                setText((prevText) => {
                                                    const content = attachmentToRemove.content;
                                                    let newText = prevText;

                                                    // 1. Content preceded by two newlines (how it was appended)
                                                    const withPrefix = `\n\n${content}`;
                                                    const idxPrefix = newText.indexOf(withPrefix);
                                                    if (idxPrefix !== -1) {
                                                        newText = newText.slice(0, idxPrefix) + newText.slice(idxPrefix + withPrefix.length);
                                                    } else {
                                                        // 2. Content followed by two newlines (beginning of text)
                                                        const withSuffix = `${content}\n\n`;
                                                        const idxSuffix = newText.indexOf(withSuffix);
                                                        if (idxSuffix !== -1) {
                                                            newText = newText.slice(0, idxSuffix) + newText.slice(idxSuffix + withSuffix.length);
                                                        } else {
                                                            // 3. Fallback: first occurrence of the raw content
                                                            const idx = newText.indexOf(content);
                                                            if (idx !== -1) {
                                                                newText = newText.slice(0, idx) + newText.slice(idx + content.length);
                                                            }
                                                        }
                                                    }

                                                    return newText;
                                                });
                                                if (provider === "Google" || provider === "Anthropic") {
                                                    setNeedsRecalculation(true);
                                                }
                                            }}
                                            className="h-6 w-6 flex-shrink-0 ml-auto"
                                        >
                                            ×
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
} 