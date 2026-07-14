# ---------- build stage ----------
FROM golang:1.26-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /trellis-backend .

# ---------- run stage ----------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /trellis-backend .

EXPOSE 8080
ENTRYPOINT ["/app/trellis-backend"]
