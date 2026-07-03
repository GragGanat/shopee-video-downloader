import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { extractShopeeVideo } from "./services/shopee.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Parse JSON bodies
  app.use(express.json({ limit: "10mb" }));

  // API endpoint for Shopee video extraction
  app.post("/api/download", async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Please provide a valid Shopee video URL" });
      }

      // Validate Shopee URL
      const shopeeUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:shopee\.(?:co\.id|com\.my|ph|vn|sg|tw|co\.th|com\.br|com\.mx|com\.co)|shp\.ee|x\.shp\.ee|s\.shopee\.|sv\.shopee\.)/i;
      if (!shopeeUrlRegex.test(url)) {
        return res.status(400).json({ error: "Invalid Shopee URL. Please use a valid Shopee link (shp.ee, sv.shopee.co.id, shopee.co.id, etc.)" });
      }

      // Extract video using Playwright
      const result = await extractShopeeVideo(url);

      res.json({
        success: true,
        videoUrl: result.videoUrl,
        title: result.title,
        cover: result.cover,
        author: result.author,
        desc: result.desc,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch video";
      res.status(500).json({ error: message });
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
