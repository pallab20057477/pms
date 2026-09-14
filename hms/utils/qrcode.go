package utils

import (
	"encoding/base64"
	"fmt"

	qrcode "github.com/skip2/go-qrcode"
)

// GenerateQRBase64 returns a base64-encoded PNG QR code for the given content.
func GenerateQRBase64(content string) (string, error) {
	png, err := qrcode.Encode(content, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(png), nil
}

// GenerateQRBase64WithSize returns a base64-encoded PNG QR code at a custom size.
func GenerateQRBase64WithSize(content string, size int) (string, error) {
	png, err := qrcode.Encode(content, qrcode.High, size)
	if err != nil {
		return "", fmt.Errorf("qr encode: %w", err)
	}
	return base64.StdEncoding.EncodeToString(png), nil
}
