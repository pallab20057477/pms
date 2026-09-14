package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"io"
	"os"
)

// getEncryptionKey returns the master AES key (must be exactly 32 bytes for AES-256).
func getEncryptionKey() []byte {
	key := os.Getenv("ENCRYPTION_KEY")
	if len(key) == 32 {
		return []byte(key)
	}
	// Fallback key if not set in environment.
	// WARNING: In a real production system, this must be securely provided via env vars!
	fallback := "averysecure32bytefallbackkey1234"
	return []byte(fallback)
}

// EncryptAES encrypts plain text string into a base64 encoded string using AES-GCM.
func EncryptAES(plainText string) (string, error) {
	if plainText == "" {
		return "", nil
	}
	key := getEncryptionKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	cipherText := gcm.Seal(nonce, nonce, []byte(plainText), nil)
	return base64.StdEncoding.EncodeToString(cipherText), nil
}

// DecryptAES decrypts a base64 encoded string back to plain text using AES-GCM.
// Returns the original string if it is not base64 or fails decryption (for backward compatibility).
func DecryptAES(cryptoText string) string {
	if cryptoText == "" {
		return ""
	}
	cipherText, err := base64.StdEncoding.DecodeString(cryptoText)
	if err != nil {
		// Not base64, assume it's legacy plain text
		return cryptoText
	}

	key := getEncryptionKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return cryptoText
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return cryptoText
	}

	if len(cipherText) < gcm.NonceSize() {
		return cryptoText // Too short
	}

	nonce, cipherText := cipherText[:gcm.NonceSize()], cipherText[gcm.NonceSize():]
	plainText, err := gcm.Open(nil, nonce, cipherText, nil)
	if err != nil {
		// Decryption failed, assume it was legacy plain text that happened to be base64
		return cryptoText
	}

	return string(plainText)
}
