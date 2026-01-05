import TokenAnalyzer from "./components/TokenAnalyzer";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TokenAnalyzer />
      <Toaster position="bottom-right" richColors closeButton />
    </ThemeProvider>
  );
}
