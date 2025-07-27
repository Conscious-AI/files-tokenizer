import TokenAnalyzer from "./components/TokenAnalyzer";
import { ThemeProvider } from "@/components/theme-provider";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TokenAnalyzer />
    </ThemeProvider>
  );
}
