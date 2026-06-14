FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY api ./api
COPY inngest ./inngest
COPY lib ./lib
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
