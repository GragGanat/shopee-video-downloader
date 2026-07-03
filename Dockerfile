# Use Node.js v24 slim image as the base
FROM node:24-bookworm-slim

# Set the working directory
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# COPY THE PATCHES FOLDER! (This fixes the wouter patch error)
COPY patches ./patches

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Install Playwright and its system dependencies
RUN npx playwright install --with-deps chromium

# Copy the rest of your code
COPY . .

# Build the project
RUN pnpm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000 

# Expose the port
EXPOSE 3000

# Start the app
CMD ["pnpm", "run", "start"]
