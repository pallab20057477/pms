package utils

import (
	"encoding/base64"
	"fmt"
	"log"

	"hms/models"
)

type BookingNotifyData struct {
	GuestName    string
	GuestEmail   string
	GuestPhone   string
	BookingCode  string
	RoomNumber   string
	RoomType     string
	HotelName    string
	HotelAddress string
	CheckInDate  string
	CheckOutDate string
	Nights       int
	TotalAmount  float64
	OTP          string // 6-digit OTP shown to guest
	QRToken      string // raw secure token encoded in QR
	QRBase64     string // base64 PNG of QR code

	// Bill Breakdown Fields
	BaseRate       float64
	DiscountAmount float64
	RoomChargesNet float64
	FolioTotal     float64
	Subtotal       float64
	TaxAmount      float64
	TaxRate        float64
	GrandTotal     float64
	TotalPaid      float64
	BalanceDue     float64
	FolioItems     []models.FolioItem
}

// SendBookingConfirmation sends booking confirmation via email and WhatsApp.
// Non-blocking — runs in a goroutine.
func SendBookingConfirmation(d BookingNotifyData) {
	return // Emails temporarily disabled per user request
	
	go func() {
		nights := d.Nights
		if nights < 1 {
			nights = 1
		}

		// ── Email ────────────────────────────────────────────────────────────
		if d.GuestEmail != "" {
			var inlineImages []InlineImage
			qrImg := ""
			if d.QRBase64 != "" {
				if data, err := base64.StdEncoding.DecodeString(d.QRBase64); err == nil && len(data) > 0 {
					inlineImages = append(inlineImages, InlineImage{CID: "qrcode.png", Data: data})
					qrImg = `<img src="cid:qrcode.png" alt="Check-in QR" width="180" height="180" style="border:3px solid #0d8b79;border-radius:8px;display:block;margin:0 auto 8px;" />`
				}
			}

			detRow := func(label, value string) string {
				return `<tr>` +
					`<td style="padding:9px 14px;border:1px solid #dde3e7;background:#f8fafb;font-size:13px;color:#666;width:36%;">` + label + `</td>` +
					`<td style="padding:9px 14px;border:1px solid #dde3e7;font-size:13px;color:#1a1a1a;">` + value + `</td>` +
					`</tr>`
			}

			hotelAddressLine := ""
			if d.HotelAddress != "" {
				hotelAddressLine = `<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">` + d.HotelAddress + `</div>`
			}

			html := `<!doctype html>` +
				`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
				`<title>Booking Confirmation</title></head>` +
				`<body style="margin:0;padding:0;background:#eef2f5;font-family:Arial,Helvetica,sans-serif;">` +

				`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f5;padding:32px 0;">` +
				`<tr><td align="center">` +

				`<table width="580" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">` +

				// ── Green header
				`<tr><td align="center" style="background:#0d8b79;padding:28px 24px;">` +
				`<div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">&#127968; ` + d.HotelName + `</div>` +
				hotelAddressLine +
				`<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:6px;">Booking Confirmation</div>` +
				`</td></tr>` +

				// ── Greeting
				`<tr><td style="padding:24px 28px 8px;">` +
				`<p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">Dear <strong>` + d.GuestName + `</strong>,</p>` +
				`<p style="margin:0;font-size:14px;color:#555;">Your reservation has been <strong style="color:#0d8b79;">confirmed</strong>. We look forward to welcoming you!</p>` +
				`</td></tr>` +

				// ── Booking details table
				`<tr><td style="padding:16px 28px;">` +
				`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
				`<tr><td colspan="2" style="padding:8px 14px;background:#0d8b79;font-size:12px;font-weight:700;color:#fff;letter-spacing:0.5px;text-transform:uppercase;">Booking Details</td></tr>` +
				detRow("Booking ID", "<strong>"+d.BookingCode+"</strong>") +
				detRow("Room", d.RoomNumber+" &mdash; "+d.RoomType) +
				detRow("Check-in", d.CheckInDate) +
				detRow("Check-out", d.CheckOutDate) +
				detRow("Duration", fmt.Sprintf("%d Night(s)", nights)) +
				detRow("Total Amount", fmt.Sprintf("<strong style=\"color:#0d8b79;\">&#8377; %.2f</strong>", d.TotalAmount)) +
				`</table>` +
				`</td></tr>` +

				// ── Bill Breakdown table
				`<tr><td style="padding:0 28px 16px;">` +
				`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
				`<tr><td colspan="2" style="padding:8px 14px;background:#103b5b;font-size:12px;font-weight:700;color:#fff;letter-spacing:0.5px;text-transform:uppercase;">Bill Breakdown</td></tr>` +
				detRow(fmt.Sprintf("Base Room Rate (%d night(s) &times; &#8377; %.2f)", nights, d.BaseRate), fmt.Sprintf("&#8377; %.2f", d.BaseRate*float64(nights))) +
				(func() string {
					if d.DiscountAmount > 0 {
						return detRow("Booking Discount", fmt.Sprintf("<span style=\"color:#e53e3e;\">-&#8377; %.2f</span>", d.DiscountAmount))
					}
					return ""
				})() +
				detRow("Room Charges (net)", fmt.Sprintf("&#8377; %.2f", d.RoomChargesNet)) +
				(func() string {
					if len(d.FolioItems) == 0 {
						return ""
					}
					s := ""
					for _, item := range d.FolioItems {
						taxStr := ""
						if item.Taxable {
							taxStr = " (taxable)"
						}
						s += detRow(fmt.Sprintf("%s [%s]%s", item.Description, item.Type, taxStr), fmt.Sprintf("&#8377; %.2f", item.Amount))
					}
					s += detRow("<strong>Total Extra Services</strong>", fmt.Sprintf("<strong>&#8377; %.2f</strong>", d.FolioTotal))
					return s
				})() +
				detRow("Subtotal (before tax)", fmt.Sprintf("&#8377; %.2f", d.Subtotal)) +
				detRow(fmt.Sprintf("GST @ %.2f%% (booking snapshot)", d.TaxRate), fmt.Sprintf("&#8377; %.2f", d.TaxAmount)) +
				detRow("<strong>Grand Total</strong>", fmt.Sprintf("<strong style=\"color:#0d8b79;font-size:14px;\">&#8377; %.2f</strong>", d.GrandTotal)) +
				detRow("Total Paid", fmt.Sprintf("<span style=\"color:#0d8b79;\">-&#8377; %.2f</span>", d.TotalPaid)) +
				detRow("<strong>Balance Due</strong>", fmt.Sprintf("<strong style=\"color:#1a1a1a;font-size:14px;\">&#8377; %.2f</strong>", d.BalanceDue)) +
				`</table>` +
				`</td></tr>` +

				// ── Check-in pass (QR + OTP)
				`<tr><td style="padding:8px 28px 24px;">` +
				`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px dashed #9dd4cc;border-radius:10px;background:#f0faf8;">` +
				`<tr><td align="center" style="padding:20px 16px 8px;">` +
				`<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#444;margin-bottom:4px;">Your Check-in Pass</div>` +
				`<div style="font-size:12px;color:#888;margin-bottom:14px;">Show this to the front desk on arrival</div>` +
				qrImg +
				`<div style="font-size:11px;color:#888;margin-bottom:16px;">Scan QR code at front desk for instant check-in</div>` +
				`</td></tr>` +
				`<tr><td align="center" style="padding:0 16px 20px;">` +
				`<table cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;padding:14px 28px;margin:0 auto;">` +
				`<tr><td align="center">` +
				`<div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Check-in OTP</div>` +
				`<div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0d8b79;font-family:'Courier New',monospace;">` + d.OTP + `</div>` +
				`<div style="font-size:11px;color:#bbb;margin-top:8px;">Valid for 24 hours from booking</div>` +
				`</td></tr></table>` +
				`</td></tr></table>` +
				`</td></tr>` +

				// ── Footer
				`<tr><td align="center" style="padding:16px 24px;background:#f7f9fa;border-top:1px solid #e8ecef;font-size:11px;color:#aaa;">` +
				d.HotelName + ` &nbsp;&bull;&nbsp; This is an automated confirmation. Please do not reply.` +
				`</td></tr>` +

				`</table>` + // inner 580px card
				`</td></tr></table>` + // outer wrapper
				`</body></html>`

			subject := "Booking Confirmed: " + d.BookingCode + " — " + d.HotelName
			if err := SendEmailWithInlineImages(d.GuestEmail, subject, html, inlineImages); err != nil {
				log.Printf("[notify] email failed for booking %s: %v", d.BookingCode, err)
			} else {
				log.Printf("[notify] email sent for booking %s to %s", d.BookingCode, d.GuestEmail)
			}
		}

		// ── WhatsApp ─────────────────────────────────────────────────────────
		// TODO: WhatsApp integration — implement in future
		// if d.GuestPhone != "" {
		// 	templateName := os.Getenv("WHATSAPP_TEMPLATE_NAME")
		// 	var waErr error
		//
		// 	if templateName != "" {
		// 		components := fmt.Sprintf(`[{"type":"body","parameters":[`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s},`+
		// 			`{"type":"text","text":%s}`+
		// 			`]}]`,
		// 			jsonString(d.GuestName), jsonString(d.HotelName),
		// 			jsonString(d.BookingCode),
		// 			jsonString(fmt.Sprintf("%s %s", d.RoomNumber, d.RoomType)),
		// 			jsonString(d.CheckInDate), jsonString(d.CheckOutDate),
		// 			jsonString(fmt.Sprintf("%d", nights)), jsonString(d.OTP),
		// 		)
		// 		waErr = SendWhatsAppTemplate(d.GuestPhone, templateName, "en", components)
		// 	} else {
		// 		msg := fmt.Sprintf(
		// 			"✅ *Booking Confirmed!*\n\nDear *%s*,\nYour booking at *%s* is confirmed.\n\n"+
		// 				"📋 *Booking ID:* %s\n🛏 *Room:* %s %s\n"+
		// 				"📅 *Check-in:* %s\n📅 *Check-out:* %s\n"+
		// 				"🌙 *Nights:* %d\n💰 *Total:* ₹%.2f\n\n"+
		// 				"🔑 *Check-in OTP:* *%s*\n\n"+
		// 				"Show this OTP at the front desk on arrival.\n_We look forward to welcoming you!_ 🏨",
		// 			d.GuestName, d.HotelName, d.BookingCode, d.RoomNumber, d.RoomType,
		// 			d.CheckInDate, d.CheckOutDate, nights, d.TotalAmount, d.OTP,
		// 		)
		// 		waErr = SendWhatsApp(d.GuestPhone, msg)
		// 	}
		// 	if waErr != nil {
		// 		log.Printf("[notify] whatsapp failed for booking %s: %v", d.BookingCode, waErr)
		// 	} else {
		// 		log.Printf("[notify] whatsapp sent for booking %s to %s", d.BookingCode, d.GuestPhone)
		// 	}
		// }
	}()
}
