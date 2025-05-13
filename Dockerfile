# Use the official Go image as a parent image
FROM golang:1.22-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy go.mod and go.sum to download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o slack-rag-server

# Use a minimal alpine image for the final stage
FROM alpine:3.18

# Add ca-certificates for secure connections
RUN apk --no-cache add ca-certificates

# Set the working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/slack-rag-server .
# Copy the .env.example file (user will need to rename to .env or provide env vars)
COPY --from=builder /app/.env* ./

# Expose the port the app runs on
EXPOSE 8083

# Run the binary
CMD ["./slack-rag-server"]
