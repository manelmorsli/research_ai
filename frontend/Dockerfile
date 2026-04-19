FROM node:20-alpine
WORKDIR /app

# Install dependencies first (cached layer unless package.json changes)
COPY package*.json ./
RUN npm install

# Source is bind-mounted at runtime via volume — just define the start command
CMD ["npm", "run", "dev"]
