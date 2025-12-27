# Gunakan Node.js versi stable dan ringan
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --production

# Copy semua source code
COPY . .

# Koyeb akan meng-inject PORT, tapi kita expose port 3000
EXPOSE 3000

# Jalankan server
CMD ["node", "index.js"]
