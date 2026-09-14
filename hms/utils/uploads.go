package utils

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// uploadBasePath returns the configured upload root directory from env, defaulting to ./uploads.
func uploadBasePath() string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("UPLOAD_BASE_PATH")), "/\\")
	if base == "" {
		return "./uploads"
	}
	return base
}

// UploadDir returns the full disk path for a given subdir (e.g. "rooms", "staff").
func UploadDir(subdir string) string {
	if subdir == "" {
		subdir = "misc"
	}
	return filepath.Join(uploadBasePath(), subdir)
}

// UploadToServer saves an opened multipart.File to <UPLOAD_BASE_PATH>/<subdir> and returns a relative URL path.
func UploadToServer(ctx context.Context, file multipart.File, filename string, subdir string) (string, string, error) {
	if subdir == "" {
		subdir = "rooms"
	}
	dir := UploadDir(subdir)
	_ = os.MkdirAll(dir, 0755)
	safe := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(filename))
	dstPath := filepath.Join(dir, safe)
	out, err := os.Create(dstPath)
	if err != nil {
		return "", "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		return "", "", err
	}
	rel := fmt.Sprintf("/uploads/%s/%s", subdir, safe)
	return rel, "", nil
}

// DeleteFromServer kept for compatibility; controllers delete local files directly.
func DeleteFromServer(ctx context.Context, publicID string) error {
	return nil
}
