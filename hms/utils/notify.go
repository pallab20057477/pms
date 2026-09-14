package utils

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"gopkg.in/gomail.v2"
)

// SendEmail sends an HTML email via the configured SMTP server.
func SendEmail(to, subject, htmlBody string) error {
	return SendEmailWithInlineImages(to, subject, htmlBody, nil)
}

// InlineImage holds raw PNG bytes to embed in email via CID attachment.
type InlineImage struct {
	CID  string // referenced in HTML as <img src="cid:CID">
	Data []byte // raw PNG bytes
}

// SendEmailWithInlineImages sends an HTML email with optional CID-embedded images.
func SendEmailWithInlineImages(to, subject, htmlBody string, images []InlineImage) error {
	return nil // Emails temporarily disabled per user request
	
	host := os.Getenv("MAIL_HOST")
	portStr := os.Getenv("MAIL_PORT")
	username := os.Getenv("MAIL_USERNAME")
	password := os.Getenv("MAIL_PASSWORD")
	fromAddr := os.Getenv("MAIL_FROM_ADDRESS")
	fromName := os.Getenv("MAIL_FROM_NAME")
	encryption := strings.ToLower(strings.TrimSpace(os.Getenv("MAIL_ENCRYPTION")))

	if host == "" || username == "" {
		return fmt.Errorf("email not configured")
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 587
	}

	m := gomail.NewMessage()
	m.SetAddressHeader("From", fromAddr, fromName)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", htmlBody)

	for _, img := range images {
		data := img.Data
		cid := img.CID
		m.Embed(cid,
			gomail.SetCopyFunc(func(w io.Writer) error {
				_, err := io.Copy(w, bytes.NewReader(data))
				return err
			}),
			gomail.SetHeader(map[string][]string{
				"Content-Type": {"image/png"},
				"Content-ID":   {"<" + cid + ">"},
			}),
		)
	}

	d := gomail.NewDialer(host, port, username, password)
	d.TLSConfig = &tls.Config{InsecureSkipVerify: false, ServerName: host}
	if encryption == "ssl" || port == 465 {
		d.SSL = true
	}

	return d.DialAndSend(m)
}

// TODO: WhatsApp integration — implement in future
//
// func SendWhatsApp(toPhone, message string) error {
// 	phoneNumberID := os.Getenv("WHATSAPP_PHONE_NUMBER_ID")
// 	accessToken := os.Getenv("WHATSAPP_ACCESS_TOKEN")
// 	if phoneNumberID == "" || accessToken == "" {
// 		return fmt.Errorf("WhatsApp not configured (set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN)")
// 	}
// 	to := normalizeWhatsAppPhone(toPhone)
// 	payload := fmt.Sprintf(`{"messaging_product":"whatsapp","to":"%s","type":"text","text":{"body":%s}}`,
// 		to, jsonString(message))
// 	return metaWhatsAppPost(phoneNumberID, accessToken, payload)
// }
//
// func SendWhatsAppTemplate(toPhone, templateName, languageCode, components string) error {
// 	phoneNumberID := os.Getenv("WHATSAPP_PHONE_NUMBER_ID")
// 	accessToken := os.Getenv("WHATSAPP_ACCESS_TOKEN")
// 	if phoneNumberID == "" || accessToken == "" {
// 		return fmt.Errorf("WhatsApp not configured")
// 	}
// 	to := normalizeWhatsAppPhone(toPhone)
// 	payload := fmt.Sprintf(`{"messaging_product":"whatsapp","to":"%s","type":"template","template":{"name":"%s","language":{"code":"%s"},"components":%s}}`,
// 		to, templateName, languageCode, components)
// 	return metaWhatsAppPost(phoneNumberID, accessToken, payload)
// }
//
// func metaWhatsAppPost(phoneNumberID, accessToken, jsonPayload string) error {
// 	apiURL := fmt.Sprintf("https://graph.facebook.com/v19.0/%s/messages", phoneNumberID)
// 	req, err := http.NewRequest("POST", apiURL, strings.NewReader(jsonPayload))
// 	if err != nil {
// 		return err
// 	}
// 	req.Header.Set("Authorization", "Bearer "+accessToken)
// 	req.Header.Set("Content-Type", "application/json")
// 	resp, err := http.DefaultClient.Do(req)
// 	if err != nil {
// 		return err
// 	}
// 	defer resp.Body.Close()
// 	if resp.StatusCode >= 400 {
// 		body, _ := io.ReadAll(resp.Body)
// 		return fmt.Errorf("meta whatsapp error %d: %s", resp.StatusCode, string(body))
// 	}
// 	return nil
// }
//
// func normalizeWhatsAppPhone(phone string) string {
// 	s := strings.TrimSpace(phone)
// 	s = strings.TrimPrefix(s, "whatsapp:")
// 	var b strings.Builder
// 	for _, r := range s {
// 		if r >= '0' && r <= '9' {
// 			b.WriteRune(r)
// 		}
// 	}
// 	return b.String()
// }

func jsonString(s string) string {
	b := strings.NewReplacer(
		`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`,
	).Replace(s)
	return `"` + b + `"`
}
