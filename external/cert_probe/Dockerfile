FROM golang:1.23-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /cert-probe .

FROM scratch
COPY --from=build /cert-probe /cert-probe
EXPOSE 8080
ENTRYPOINT ["/cert-probe"]
