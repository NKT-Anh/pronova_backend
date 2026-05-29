# Base image for development and building
FROM node:20-alpine

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Set working directory
WORKDIR /app

# Copy dependency files first
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Expose the application port
EXPOSE 3000

# Start NestJS development server
CMD ["npm", "run", "start:dev"]
