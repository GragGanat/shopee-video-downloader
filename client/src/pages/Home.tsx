import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Link2, Video, Loader2, ExternalLink, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

interface VideoResult {
  videoUrl: string;
  title: string;
  cover: string;
  author: string;
  desc: string;
}

function detectShopeeUrl(url: string): string | null {
  const shopeeRegex = /(?:https?:\/\/)?(?:www\.)?(?:shopee\.(?:co\.id|com\.my|ph|vn|sg|tw|co\.th|com\.br|com\.mx|com\.co)|shp\.ee|x\.shp\.ee|s\.shopee\.|sv\.shopee\.)/i;
  if (shopeeRegex.test(url.trim())) return url.trim();
  return null;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidUrl, setIsValidUrl] = useState(false);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUrl(value);
    setIsValidUrl(detectShopeeUrl(value) !== null);
    if (result) {
      setResult(null);
    }
    if (error) {
      setError(null);
    }
  }, [result, error]);

  const handleDownload = useCallback(async () => {
    const validUrl = detectShopeeUrl(url);
    if (!validUrl) {
      setError("Please enter a valid Shopee video URL");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch video");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleCopyUrl = useCallback((videoUrl: string) => {
    navigator.clipboard.writeText(videoUrl);
    toast.success("Video URL copied to clipboard!", {
      duration: 2000,
    });
  }, []);

  const handleDirectDownload = useCallback((videoUrl: string) => {
    window.open(videoUrl, "_blank");
    toast.info("Opening video in new tab... right-click to save", {
      duration: 3000,
    });
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setIsValidUrl(detectShopeeUrl(text) !== null);
    } catch (e) {
      toast.error("Unable to paste from clipboard");
    }
  }, []);

  return (
    <div className="min-h-screen font-body relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Hero Section */}
        <section className="relative pt-20 pb-12 sm:pt-28 sm:pb-16">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center max-w-2xl mx-auto"
            >
              {/* Logo */}
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center shadow-lg shadow-primary/25">
                    <Video className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Download className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>

              {/* Title */}
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
                Shopee Video{" "}
                <span className="bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                  Downloader
                </span>
              </h1>

              <p className="text-muted-foreground text-lg sm:text-xl mb-2 font-light">
                Download any Shopee video in seconds, free and without watermark.
              </p>

              <p className="text-muted-foreground/70 text-sm mb-8">
                Works with all Shopee regions: Indonesia, Malaysia, Philippines, Vietnam, Singapore, Taiwan, Thailand, Brazil, Mexico, Colombia
              </p>
            </motion.div>
          </div>
        </section>

        {/* Main Tool Section */}
        <section className="pb-16 sm:pb-24">
          <div className="container max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            >
              {/* Input Card */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-xl shadow-black/20">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex flex-col gap-4">
                    {/* URL Input */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Paste Shopee video link here..."
                          value={url}
                          onChange={handleUrlChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && isValidUrl && !loading) {
                              handleDownload();
                            }
                          }}
                          className="pl-10 h-12 text-base bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/30"
                        />
                      </div>
                      <Button
                        onClick={handleDownload}
                        disabled={!isValidUrl || loading}
                        className="h-12 px-8 font-semibold bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 shadow-lg shadow-primary/25 transition-all duration-200 active:scale-[0.97]"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {loading ? "Processing..." : "Download"}
                      </Button>
                    </div>

                    {/* Paste button */}
                    <button
                      onClick={handlePaste}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors self-start flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Paste from clipboard
                    </button>

                    {/* URL detection badge */}
                    <AnimatePresence>
                      {isValidUrl && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Shopee URL detected
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Error message */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Result card */}
                    <AnimatePresence>
                      {result && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border/30">
                            {/* Video thumbnail / info */}
                            <div className="flex flex-col sm:flex-row gap-4">
                              {result.cover && (
                                <div className="shrink-0">
                                  <div className="w-full sm:w-32 h-48 sm:h-32 rounded-lg bg-muted overflow-hidden">
                                    <img
                                      src={result.cover}
                                      alt={result.title}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-display font-semibold text-white text-base mb-1 line-clamp-2">
                                  {result.title}
                                </h3>
                                <p className="text-muted-foreground text-sm mb-3">
                                  {result.desc || "Shopee Video"}
                                </p>
                                <div className="flex items-center gap-2 mb-4">
                                  <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                    Shopee
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    by {result.author}
                                  </span>
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleDirectDownload(result.videoUrl)}
                                    className="bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 shadow-md shadow-primary/20 active:scale-[0.97]"
                                  >
                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                    Download Video
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopyUrl(result.videoUrl)}
                                    className="border-border/30 hover:bg-muted/50 active:scale-[0.97]"
                                  >
                                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                                    Copy URL
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(result.videoUrl, "_blank")}
                                    className="border-border/30 hover:bg-muted/50 active:scale-[0.97]"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                    Open
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* How it works */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="mt-16"
            >
              <h2 className="font-display text-2xl font-bold text-white text-center mb-8">
                How It Works
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  {
                    step: "01",
                    icon: <Link2 className="w-6 h-6" />,
                    title: "Copy the Link",
                    desc: "Copy the Shopee video share link from the app or website",
                  },
                  {
                    step: "02",
                    icon: <Video className="w-6 h-6" />,
                    title: "Paste Here",
                    desc: "Paste the link in the input box above and click Download",
                  },
                  {
                    step: "03",
                    icon: <Download className="w-6 h-6" />,
                    title: "Download",
                    desc: "Get the video file instantly, no watermark, completely free",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                  >
                    <Card className="border-border/30 bg-card/50 backdrop-blur-sm h-full hover:border-primary/30 transition-colors duration-300">
                      <CardContent className="p-6 text-center">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
                          {item.icon}
                        </div>
                        <div className="text-xs font-semibold text-primary/70 mb-2">
                          STEP {item.step}
                        </div>
                        <h3 className="font-display font-semibold text-white mb-2">
                          {item.title}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          {item.desc}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* FAQ Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
              className="mt-16 mb-16"
            >
              <h2 className="font-display text-2xl font-bold text-white text-center mb-8">
                Frequently Asked Questions
              </h2>
              <div className="space-y-3 max-w-2xl mx-auto">
                {[
                  {
                    q: "Which Shopee regions are supported?",
                    a: "We support all Shopee regions: Indonesia, Malaysia, Philippines, Vietnam, Singapore, Taiwan, Thailand, Brazil, Mexico, and Colombia.",
                  },
                  {
                    q: "Is it free to use?",
                    a: "Yes, completely free. No sign-up required, no download limits.",
                  },
                  {
                    q: "Do videos have watermarks?",
                    a: "No. We extract the original video file without any watermarks.",
                  },
                  {
                    q: "Why is it slower than other downloaders?",
                    a: "Shopee requires us to render the page in a real browser to extract video data. This takes a few extra seconds but ensures reliable results.",
                  },
                ].map((faq, i) => (
                  <Card key={i} className="border-border/30 bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-4 sm:p-5">
                      <h4 className="font-display font-semibold text-white text-sm mb-1.5">
                        {faq.q}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {faq.a}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/30 py-8">
          <div className="container text-center">
            <p className="text-muted-foreground/60 text-sm">
              Shopee Video Downloader — Not affiliated with Shopee. Videos are downloaded from publicly accessible sources.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
