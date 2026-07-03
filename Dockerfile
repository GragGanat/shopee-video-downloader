# Use Node.js v24 slim image as the base
FROM node:24-bookworm-slim

# Set the working directory
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy everything into the container
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Build the project
RUN pnpm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000 

# Expose the port
EXPOSE 3000

# Start the app
CMD ["pnpm", "run", "start"]
