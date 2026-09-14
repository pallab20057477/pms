# Stage 1: Build the Go application
FROM golang:1.25-alpine AS builder

WORKDIR /var/www/hms_backend

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /go-app .


# Stage 2: Minimal runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	tzdata \
	wkhtmltopdf \
	xvfb \
	fonts-dejavu-core \
	fonts-noto-core \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /hms_backend

COPY --from=builder /go-app /go-app
COPY --from=builder /var/www/hms_backend/templates /hms_backend/templates

ENV WKHTMLTOPDF_PATH=/usr/bin/wkhtmltopdf

EXPOSE 8080

ENTRYPOINT ["/go-app"]