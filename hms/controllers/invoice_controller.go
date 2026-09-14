package controllers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"hms/config"
	"hms/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

func effectiveInvoiceHotelTaxRate(h models.Hotel) float64 {
	if h.TaxPercent < 0 {
		return 0
	}
	return h.TaxPercent
}

func professionalInvoiceStatusLabel(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	switch s {
	case "partial":
		return "Partially Paid"
	case "paid":
		return "Paid in Full"
	case "unpaid":
		return "Payment Pending"
	case "cancelled", "canceled":
		return "Cancelled"
	default:
		if s == "" {
			return "Pending"
		}
		return strings.Title(strings.ReplaceAll(s, "_", " "))
	}
}

// LiveInvoiceData represents calculated invoice data (not stored in DB, always fresh)
type LiveInvoiceData struct {
	HotelID           uint               `json:"hotel_id"`
	BookingID         uint               `json:"booking_id"`
	InvoiceNo         string             `json:"invoice_no"`
	InvoiceDate       string             `json:"invoice_date"`
	Status            string             `json:"status"`
	TaxType           string             `json:"tax_type"`
	TaxPercent        float64            `json:"tax_percent"`
	Nights            int                `json:"nights"`
	TotalGuests       int                `json:"total_guests"`
	IncludedGuests    int                `json:"included_guests"`
	ExtraGuestCount   int                `json:"extra_guest_count"`
	ExtraGuestRate    float64            `json:"extra_guest_rate"`
	BaseRoomCharges   float64            `json:"base_room_charges"`
	ExtraGuestCharges float64            `json:"extra_guest_charges"`
	Subtotal          float64            `json:"subtotal"`
	TaxPart1          float64            `json:"tax_part1"` // first split component (e.g. CGST)
	TaxPart2          float64            `json:"tax_part2"` // second split component (e.g. SGST)
	TaxTotal          float64            `json:"tax_total"`
	TotalAmount       float64            `json:"total_amount"`
	RoomCharges       float64            `json:"room_charges"`
	FolioItems        []models.FolioItem `json:"folio_items"`
	FolioTotal        float64            `json:"folio_total"`
	LateStayCharge    float64            `json:"late_stay_charge"`
	Discount          float64            `json:"discount"`
	Advance           float64            `json:"advance"`
	PaymentsTotal     float64            `json:"payments_total"`
	TotalPaid         float64            `json:"total_paid"`
	Payments          []models.Payment   `json:"payments"`
	BalanceDue        float64            `json:"balance_due"`
	CreditBalance     float64            `json:"credit_balance"`
	RefundDue         float64            `json:"refund_due"`
	GrandTotal        float64            `json:"grand_total"`
}

type invoiceCompanionDetail struct {
	Serial   int
	Name     string
	Age      string
	Gender   string
	Relation string
	Phone    string
	IDType   string
	IDNumber string
	Notes    string
	Document string
}

func parseCompanionDocumentMap(raw string) map[int]string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return map[int]string{}
	}

	out := map[int]string{}
	var asObject map[string]string
	if err := json.Unmarshal([]byte(raw), &asObject); err == nil {
		for k, v := range asObject {
			idx, convErr := strconv.Atoi(strings.TrimSpace(k))
			if convErr != nil || idx < 0 {
				continue
			}
			val := strings.TrimSpace(v)
			if val != "" {
				out[idx] = val
			}
		}
		return out
	}

	parts := strings.Split(raw, ",")
	for idx, part := range parts {
		val := strings.TrimSpace(part)
		if val != "" {
			out[idx] = val
		}
	}
	return out
}

func parseCompanionDetailsForInvoice(raw string, rawDocs string) []invoiceCompanionDetail {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	docMap := parseCompanionDocumentMap(rawDocs)
	var parsed []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil
	}
	out := make([]invoiceCompanionDetail, 0, len(parsed))
	for i, row := range parsed {
		c := invoiceCompanionDetail{
			Serial:   i + 2,
			Name:     strings.TrimSpace(fmt.Sprint(row["name"])),
			Age:      strings.TrimSpace(fmt.Sprint(row["age"])),
			Gender:   strings.TrimSpace(fmt.Sprint(row["gender"])),
			Relation: strings.TrimSpace(fmt.Sprint(row["relation"])),
			Phone:    strings.TrimSpace(fmt.Sprint(row["phone"])),
			IDType:   strings.TrimSpace(fmt.Sprint(row["id_type"])),
			IDNumber: strings.TrimSpace(fmt.Sprint(row["id_number"])),
			Notes:    strings.TrimSpace(fmt.Sprint(row["notes"])),
			Document: strings.TrimSpace(docMap[i]),
		}
		if c.Name == "" || c.Name == "<nil>" {
			c.Name = "Companion"
		}
		if c.Age == "<nil>" {
			c.Age = ""
		}
		if c.Gender == "<nil>" {
			c.Gender = ""
		}
		if c.Relation == "<nil>" {
			c.Relation = ""
		}
		if c.Phone == "<nil>" {
			c.Phone = ""
		}
		if c.IDType == "<nil>" {
			c.IDType = ""
		}
		if c.IDNumber == "<nil>" {
			c.IDNumber = ""
		}
		if c.Notes == "<nil>" {
			c.Notes = ""
		}
		out = append(out, c)
	}
	return out
}

func occupancyPricingPolicyForInvoice(hotelID uint, room *models.Room) (int, float64) {
	return occupancyPricingPolicyForRoom(hotelID, &room.RoomType)
}

func invoiceLocalNow(hotelID uint) time.Time {
	setting, err := getOrCreateSystemSetting(hotelID)
	if err == nil {
		if location, loadErr := time.LoadLocation(strings.TrimSpace(setting.TimeZone)); loadErr == nil {
			return time.Now().In(location)
		}
	}
	return time.Now()
}

func invoicePrefixForHotel(hotelID uint) string {
	setting, err := getOrCreateSystemSetting(hotelID)
	if err == nil {
		prefix := strings.ToUpper(strings.TrimSpace(setting.InvoicePrefix))
		if prefix != "" {
			return prefix
		}
	}
	return "INV"
}

func applyStoredInvoiceMetadata(inv *LiveInvoiceData, stored models.Invoice) {
	if inv == nil {
		return
	}
	if stored.ID != 0 {
		inv.InvoiceNo = strings.TrimSpace(stored.InvoiceNo)
		if strings.TrimSpace(stored.InvoiceDate) != "" {
			inv.InvoiceDate = strings.TrimSpace(stored.InvoiceDate)
		}
		if strings.TrimSpace(stored.Status) != "" {
			inv.Status = strings.TrimSpace(stored.Status)
		}
	}
}

func attachStoredInvoiceMetadata(inv *LiveInvoiceData, hotelID uint) {
	if inv == nil {
		return
	}
	var stored models.Invoice
	if err := config.DB.Where("booking_id = ?", inv.BookingID).First(&stored).Error; err == nil {
		applyStoredInvoiceMetadata(inv, stored)
	}
}

func persistInvoiceData(tx *gorm.DB, hotelID uint, inv *LiveInvoiceData) (*models.Invoice, error) {
	if inv == nil {
		return nil, fmt.Errorf("invoice data is required")
	}
	now := invoiceLocalNow(hotelID)
	invoiceDate := now.Format("2006-01-02")
	prefix := invoicePrefixForHotel(hotelID)
	var stored models.Invoice
	err := tx.Unscoped().Where("booking_id = ?", inv.BookingID).First(&stored).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		var seq struct{ Next int64 }
		if err := tx.Raw("SELECT nextval('invoice_no_seq') as next").Scan(&seq).Error; err != nil {
			return nil, err
		}
		stored = models.Invoice{
			HotelID:       hotelID,
			BookingID:     inv.BookingID,
			InvoiceNumber: seq.Next,
			InvoiceNo:     fmt.Sprintf("%s-%s-%d", prefix, now.Format("20060102"), seq.Next),
			InvoiceDate:   invoiceDate,
			Status:        strings.TrimSpace(inv.Status),
			Subtotal:      inv.Subtotal,
			TaxPart1:      inv.TaxPart1,
			TaxPart2:      inv.TaxPart2,
			TaxTotal:      inv.TaxTotal,
			TotalAmount:   inv.GrandTotal,
		}
		if stored.Status == "" {
			stored.Status = "unpaid"
		}
		if err := tx.Create(&stored).Error; err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		stored.DeletedAt = gorm.DeletedAt{}
		stored.HotelID = hotelID
		stored.InvoiceDate = invoiceDate
		stored.Status = strings.TrimSpace(inv.Status)
		if stored.Status == "" {
			stored.Status = "unpaid"
		}
		stored.Subtotal = inv.Subtotal
		stored.TaxPart1 = inv.TaxPart1
		stored.TaxPart2 = inv.TaxPart2
		stored.TaxTotal = inv.TaxTotal
		stored.TotalAmount = inv.GrandTotal
		if strings.TrimSpace(stored.InvoiceNo) == "" || stored.InvoiceNumber <= 0 {
			var seq struct{ Next int64 }
			if err := tx.Raw("SELECT nextval('invoice_no_seq') as next").Scan(&seq).Error; err != nil {
				return nil, err
			}
			stored.InvoiceNumber = seq.Next
			stored.InvoiceNo = fmt.Sprintf("%s-%s-%d", prefix, now.Format("20060102"), seq.Next)
		}
		if err := tx.Save(&stored).Error; err != nil {
			return nil, err
		}
	}

	applyStoredInvoiceMetadata(inv, stored)
	return &stored, nil
}

// calculateInvoiceDataLive computes invoice data fresh from booking, folio items, and payments
func calculateInvoiceDataLive(bookingID, hotelID uint) (*LiveInvoiceData, error) {
	var b models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", bookingID, hotelID).First(&b).Error; err != nil {
		return nil, fmt.Errorf("booking not found")
	}

	var room models.Room
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", b.RoomID, hotelID).First(&room).Error; err != nil {
		room = models.Room{}
	}

	var h models.Hotel
	if err := config.DB.First(&h, b.HotelID).Error; err != nil {
		return nil, fmt.Errorf("hotel not found")
	}

	var folioItems []models.FolioItem
	config.DB.Where("booking_id = ?", b.ID).Order("id asc").Find(&folioItems)

	var payments []models.Payment
	config.DB.Where("booking_id = ?", b.ID).Order("id asc").Find(&payments)

	nights := int(b.CheckOutDate.Sub(b.CheckInDate).Hours() / 24)
	if nights < 1 {
		nights = 1
	}
	totalGuests := b.TotalGuests
	if totalGuests < 1 {
		totalGuests = 1
	}
	includedGuests, extraGuestRate := occupancyPricingPolicyForInvoice(hotelID, &room)
	extraGuestCount := totalGuests - includedGuests
	if extraGuestCount < 0 {
		extraGuestCount = 0
	}
	baseRoomCharges := float64(nights) * b.BaseRate
	extraGuestCharges := float64(nights) * float64(extraGuestCount) * extraGuestRate

	// Calculate totals from live data
	roomCharges := b.TotalAmount
	folioTotal := 0.0
	folioTaxableTotal := 0.0
	lateStayCharge := 0.0
	for _, it := range folioItems {
		folioTotal += it.Amount
		if it.Taxable {
			folioTaxableTotal += it.Amount
		}
		if strings.Contains(strings.ToLower(it.Description), "late checkout") {
			lateStayCharge += it.Amount
		}
	}

	// Add automatic late checkout charge calculation
	// Note: Late checkout charge is already added as a folio item during checkout service
	// so we don't need to calculate it again here

	paymentsTotal := 0.0
	for _, p := range payments {
		if p.Status == "success" || p.Status == "" {
			paymentsTotal += p.Amount
		}
	}

	// Subtotal = room charges (already net of discount) + folio items
	// Late checkout charge is already added as a folio item during checkout, so don't calculate it again
	// Don't subtract discount again as it's already in roomCharges
	subtotal := roomCharges + folioTotal
	if subtotal < 0 {
		subtotal = 0
	}

	// Taxable base = room charges (already net of discount) + taxable folio items
	// Late checkout charge is already added as a folio item during checkout, so don't calculate it again
	// Don't subtract discount again as it's already in roomCharges
	taxableBase := roomCharges + folioTaxableTotal
	if taxableBase < 0 {
		taxableBase = 0
	}

	taxRate := b.TaxRate
	if taxRate < 0 {
		taxRate = 0
	}
	if taxRate == 0 {
		taxRate = effectiveInvoiceHotelTaxRate(h)
	}
	taxTotal := 0.0
	if b.Tax > 0 {
		taxTotal = b.Tax
		if taxRate > 0 && folioTaxableTotal > 0 {
			taxTotal += (folioTaxableTotal * taxRate) / 100.0
		}
	} else {
		if taxRate > 0 {
			taxTotal = taxableBase * taxRate / 100.0
		}
	}
	taxComponent := taxTotal
	part1 := taxComponent / 2.0
	part2 := taxComponent / 2.0
	grandTotal := subtotal + taxTotal
	totalPaid := paymentsTotal
	balanceDue := grandTotal - totalPaid
	creditBalance := 0.0
	refundDue := 0.0
	status := "unpaid"
	const epsilon = 0.01

	if strings.EqualFold(strings.TrimSpace(b.Status), "cancelled") || strings.EqualFold(strings.TrimSpace(b.Status), "canceled") {
		status = "cancelled"
		if b.RefundAmount > 0 {
			refundDue = b.RefundAmount
			creditBalance = refundDue
			balanceDue = 0
		} else if balanceDue < 0 {
			refundDue = -balanceDue
			creditBalance = refundDue
			balanceDue = 0
		} else {
			balanceDue = 0
		}
	} else {
		if balanceDue < 0 {
			creditBalance = -balanceDue
		}
		if balanceDue <= epsilon {
			status = "paid"
			balanceDue = 0
		} else if totalPaid > epsilon {
			status = "partial"
		}
	}

	// Placeholder invoice number — overwritten by persistInvoiceData with the sequential number
	invoiceNo := fmt.Sprintf("DRAFT-%d", b.ID)

	return &LiveInvoiceData{
		HotelID:           b.HotelID,
		BookingID:         b.ID,
		InvoiceNo:         invoiceNo,
		InvoiceDate:       invoiceLocalNow(hotelID).Format("2006-01-02"),
		Status:            status,
		TaxType:           strings.TrimSpace(h.TaxType),
		TaxPercent:        taxRate,
		Nights:            nights,
		TotalGuests:       totalGuests,
		IncludedGuests:    includedGuests,
		ExtraGuestCount:   extraGuestCount,
		ExtraGuestRate:    extraGuestRate,
		BaseRoomCharges:   baseRoomCharges,
		LateStayCharge:    lateStayCharge,
		ExtraGuestCharges: extraGuestCharges,
		RoomCharges:       roomCharges,
		FolioItems:        folioItems,
		FolioTotal:        folioTotal,
		Subtotal:          subtotal,
		Discount:          b.Discount,
		TaxPart1:          part1,
		TaxPart2:          part2,
		TaxTotal:          taxTotal,
		TotalAmount:       grandTotal,
		Advance:           b.AdvancePayment,
		Payments:          payments,
		PaymentsTotal:     paymentsTotal,
		TotalPaid:         totalPaid,
		BalanceDue:        balanceDue,
		CreditBalance:     creditBalance,
		RefundDue:         refundDue,
		GrandTotal:        grandTotal,
	}, nil
}

// GenerateInvoice calculates and persists the canonical invoice record.
func GenerateInvoice(c *gin.Context) {
	bookingIDStr := c.Param("booking_id")
	hotelID := c.GetUint("active_hotel_id")

	var bookingID uint
	if _, err := fmt.Sscanf(bookingIDStr, "%d", &bookingID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid booking ID"})
		return
	}

	invoiceData, err := calculateInvoiceDataLive(bookingID, hotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	var stored *models.Invoice
	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		var persistErr error
		stored, persistErr = persistInvoiceData(tx, hotelID, invoiceData)
		return persistErr
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to persist invoice"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             stored.ID,
		"invoice_id":     stored.ID,
		"invoice_number": stored.InvoiceNumber,
		"invoice_no":     stored.InvoiceNo,
		"booking_id":     stored.BookingID,
		"invoice":        invoiceData,
	})
}

// GetInvoice returns fresh invoice totals with persisted invoice metadata when available.
func GetInvoice(c *gin.Context) {
	bookingIDStr := c.Param("booking_id")
	hotelID := c.GetUint("active_hotel_id")

	var bookingID uint
	if _, err := fmt.Sscanf(bookingIDStr, "%d", &bookingID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid booking ID"})
		return
	}

	invoiceData, err := calculateInvoiceDataLive(bookingID, hotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	attachStoredInvoiceMetadata(invoiceData, hotelID)
	c.JSON(http.StatusOK, invoiceData)
}

func resolveInvoiceTemplatePath() string {
	if override := strings.TrimSpace(os.Getenv("INVOICE_TEMPLATE_PATH")); override != "" {
		if _, err := os.Stat(override); err == nil {
			return override
		}
	}

	if wd, err := os.Getwd(); err == nil {
		preferred := filepath.Join(wd, "templates", "invoice.html")
		if _, err := os.Stat(preferred); err == nil {
			return preferred
		}
	}

	candidates := []string{
		filepath.Join("templates", "invoice.html"),
		filepath.Join("hms", "templates", "invoice.html"),
		filepath.Join("..", "hms", "templates", "invoice.html"),
	}

	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates,
			filepath.Join(exeDir, "templates", "invoice.html"),
			filepath.Join(exeDir, "hms", "templates", "invoice.html"),
			filepath.Join(exeDir, "..", "templates", "invoice.html"),
			filepath.Join(exeDir, "..", "hms", "templates", "invoice.html"),
		)
	}

	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func resolveWkhtmltopdfBinary() (string, error) {
	override := strings.TrimSpace(os.Getenv("WKHTMLTOPDF_PATH"))
	if override != "" {
		if _, err := os.Stat(override); err == nil {
			return override, nil
		}
		if p, err := exec.LookPath(override); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("WKHTMLTOPDF_PATH is set but invalid: %s", override)
	}

	if p, err := exec.LookPath("wkhtmltopdf"); err == nil {
		return p, nil
	}

	if runtime.GOOS == "windows" {
		windowsCandidates := []string{
			`C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe`,
			`C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe`,
		}
		for _, p := range windowsCandidates {
			if _, err := os.Stat(p); err == nil {
				return p, nil
			}
		}
	} else {
		linuxCandidates := []string{
			"/usr/bin/wkhtmltopdf",
			"/usr/local/bin/wkhtmltopdf",
		}
		for _, p := range linuxCandidates {
			if _, err := os.Stat(p); err == nil {
				return p, nil
			}
		}
	}

	return "", fmt.Errorf("wkhtmltopdf not found (install it or set WKHTMLTOPDF_PATH)")
}

func generatePDFWithWkhtmltopdf(binaryPath, htmlPath, pdfPath string) error {
	args := []string{
		"--enable-local-file-access",
		"--encoding", "utf-8",
		"--print-media-type",
		"--page-size", "A4",
		"--margin-top", "6mm",
		"--margin-right", "6mm",
		"--margin-bottom", "7mm",
		"--margin-left", "6mm",
		"--zoom", "0.90",
		"--dpi", "300",
		"--image-quality", "100",
		"--footer-right", "Page [page] of [toPage]",
		htmlPath,
		pdfPath,
	}

	runCmd := func(name string, commandArgs ...string) (string, error) {
		cmd := exec.Command(name, commandArgs...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		err := cmd.Run()
		return strings.TrimSpace(stderr.String()), err
	}

	stderrText, err := runCmd(binaryPath, args...)
	if err == nil {
		return nil
	}

	// Debian/Ubuntu wkhtmltopdf can require a virtual display in headless containers.
	if runtime.GOOS == "linux" {
		if xvfbPath, xvfbErr := exec.LookPath("xvfb-run"); xvfbErr == nil {
			xvfbArgs := append([]string{"-a", binaryPath}, args...)
			retryStderr, retryErr := runCmd(xvfbPath, xvfbArgs...)
			if retryErr == nil {
				return nil
			}
			if retryStderr != "" {
				stderrText = stderrText + " | xvfb-run: " + retryStderr
			}
		}
	}

	if stderrText == "" {
		stderrText = err.Error()
	}

	return fmt.Errorf("wkhtmltopdf conversion failed: %s", stderrText)
}

func renderInvoiceFallbackPDF(inv *LiveInvoiceData, h models.Hotel, b models.Booking, g models.Guest, r models.Room) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(8, 9, 8)
	pdf.SetAutoPageBreak(true, 9)
	pdf.AliasNbPages("")
	pdf.SetFooterFunc(func() {
		pdf.SetY(-13)
		pdf.SetDrawColor(209, 218, 230)
		pdf.Line(12, pdf.GetY(), 198, pdf.GetY())
		pdf.SetY(-10)
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(95, 107, 122)
		pdf.CellFormat(0, 6, fmt.Sprintf("Generated by %s  |  Page %d/{nb}", h.Name, pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AddPage()

	rupee := "INR"
	money := func(v float64) string {
		return fmt.Sprintf("%s %.2f", rupee, v)
	}
	fitToWidth := func(text string, width float64) string {
		value := strings.TrimSpace(text)
		if value == "" {
			return "-"
		}
		if pdf.GetStringWidth(value) <= width {
			return value
		}

		suffix := "..."
		maxWidth := width - pdf.GetStringWidth(suffix)
		if maxWidth <= 0 {
			return suffix
		}

		runes := []rune(value)
		for len(runes) > 0 && pdf.GetStringWidth(string(runes)) > maxWidth {
			runes = runes[:len(runes)-1]
		}
		trimmed := strings.TrimSpace(string(runes))
		if trimmed == "" {
			return suffix
		}
		return trimmed + suffix
	}
	infoRowHeight := 4.9
	infoLabelWidth := 23.0
	infoValueWidth := 65.0
	infoCardHeight := 34.0
	titleBand := func(label string, width float64) {
		pdf.SetFillColor(10, 46, 92) // Deep Navy Blue
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont("Helvetica", "B", 9.5)
		pdf.CellFormat(width, 7, "  "+strings.ToUpper(label), "", 1, "L", true, 0, "")
		pdf.SetTextColor(31, 42, 55)
	}
	kvRow := func(baseX float64, label, value string) {
		pdf.SetX(baseX)
		pdf.SetFont("Helvetica", "", 8.7)
		pdf.SetTextColor(95, 107, 122)
		pdf.CellFormat(infoLabelWidth, infoRowHeight, label, "", 0, "L", false, 0, "")
		pdf.SetTextColor(31, 42, 55)
		pdf.SetFont("Helvetica", "B", 8.7)
		pdf.CellFormat(infoValueWidth, infoRowHeight, fitToWidth(value, infoValueWidth-1), "", 1, "L", false, 0, "")
	}
	line := func(label string, value string, highlight bool, positive bool) {
		pdf.SetFont("Helvetica", "", 9)
		if highlight {
			if positive {
				pdf.SetFillColor(234, 248, 238)
				pdf.SetTextColor(20, 98, 59)
			} else {
				pdf.SetFillColor(255, 238, 234)
				pdf.SetTextColor(150, 33, 33)
			}
			pdf.SetFont("Helvetica", "B", 11)
			pdf.CellFormat(42, 8, label, "1", 0, "L", true, 0, "")
			pdf.CellFormat(38, 8, value, "1", 1, "R", true, 0, "")
			pdf.SetTextColor(31, 42, 55)
			return
		}
		pdf.SetFillColor(250, 252, 255)
		pdf.SetTextColor(54, 70, 90)
		pdf.CellFormat(42, 7, label, "1", 0, "L", true, 0, "")
		pdf.SetTextColor(31, 42, 55)
		pdf.SetFont("Helvetica", "B", 9)
		pdf.CellFormat(38, 7, value, "1", 1, "R", false, 0, "")
	}

	// Header band
	pdf.SetFillColor(10, 46, 92)
	pdf.Rect(12, 14, 186, 20, "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 18)
	pdf.SetXY(16, 18)
	pdf.CellFormat(120, 7, strings.ToUpper(strings.TrimSpace(h.Name)), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 13)
	pdf.SetTextColor(200, 220, 245)
	pdf.CellFormat(59, 7, "BOOKING INVOICE", "", 1, "R", false, 0, "")

	// Header details
	pdf.SetTextColor(70, 82, 97)
	pdf.SetFont("Helvetica", "", 8.7)
	pdf.SetXY(15, 34)
	if addr := strings.TrimSpace(strings.TrimSpace(h.Address1+" "+h.Address2) + " " + strings.TrimSpace(h.City+" "+h.State+" "+h.Pincode)); addr != "" {
		pdf.MultiCell(125, 4.3, addr, "", "L", false)
	}
	contactParts := []string{}
	if strings.TrimSpace(h.Phone) != "" {
		contactParts = append(contactParts, "Contact: "+strings.TrimSpace(h.Phone))
	}
	if strings.TrimSpace(h.Email) != "" {
		contactParts = append(contactParts, "Email: "+strings.TrimSpace(h.Email))
	}
	if len(contactParts) > 0 {
		pdf.SetX(15)
		pdf.CellFormat(125, 4.3, strings.Join(contactParts, " | "), "", 1, "L", false, 0, "")
	}

	// Add Country and Tax Type info
	headerInfoParts := []string{}
	if strings.TrimSpace(h.Country) != "" {
		headerInfoParts = append(headerInfoParts, "Country: "+strings.TrimSpace(h.Country))
	}
	if strings.TrimSpace(h.TaxType) != "" {
		headerInfoParts = append(headerInfoParts, "Tax: "+strings.TrimSpace(h.TaxType))
	}
	if strings.TrimSpace(h.GSTNumber) != "" {
		headerInfoParts = append(headerInfoParts, "GST #: "+strings.TrimSpace(h.GSTNumber))
	}
	if len(headerInfoParts) > 0 {
		pdf.SetX(15)
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetTextColor(70, 82, 97)
		pdf.CellFormat(125, 4, strings.Join(headerInfoParts, " | "), "", 1, "L", false, 0, "")
	}

	pdf.SetXY(142, 36)
	pdf.SetFillColor(248, 250, 252)
	pdf.SetDrawColor(226, 232, 240) // Soft slate gray border
	pdf.Rect(142, 36, 56, 23, "DF")
	pdf.SetFont("Helvetica", "", 8.8)
	pdf.SetTextColor(82, 95, 112)
	pdf.SetXY(145, 37)
	pdf.CellFormat(22, 5, "Invoice No", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetTextColor(31, 42, 55)
	pdf.CellFormat(27, 5, inv.InvoiceNo, "", 1, "R", false, 0, "")
	pdf.SetX(145)
	pdf.SetFont("Helvetica", "", 8.8)
	pdf.SetTextColor(82, 95, 112)
	pdf.CellFormat(22, 5, "Date", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetTextColor(31, 42, 55)
	pdf.CellFormat(27, 5, inv.InvoiceDate, "", 1, "R", false, 0, "")

	status := strings.ToUpper(professionalInvoiceStatusLabel(inv.Status))
	pdf.SetX(145)
	pdf.SetFont("Helvetica", "B", 8.5)
	switch strings.ToLower(strings.TrimSpace(inv.Status)) {
	case "cancelled", "canceled":
		pdf.SetFillColor(255, 244, 227)
		pdf.SetTextColor(145, 88, 14)
	case "paid":
		pdf.SetFillColor(234, 248, 238)
		pdf.SetTextColor(20, 98, 59)
	default:
		if inv.BalanceDue > 0 {
			pdf.SetFillColor(255, 238, 234)
			pdf.SetTextColor(160, 36, 36)
		} else {
			pdf.SetFillColor(234, 248, 238)
			pdf.SetTextColor(20, 98, 59)
		}
	}
	pdf.CellFormat(50, 5.5, "STATUS: "+status, "", 1, "C", true, 0, "")
	pdf.SetTextColor(31, 42, 55)

	pdf.Ln(3)
	pdf.SetFont("Helvetica", "", 10)
	bookingCode := b.BookingCode
	if strings.TrimSpace(bookingCode) == "" {
		bookingCode = fmt.Sprintf("#%d", b.ID)
	}
	leftX := pdf.GetX()
	leftY := pdf.GetY()
	pdf.SetDrawColor(214, 223, 233)
	pdf.Rect(leftX, leftY, 92, infoCardHeight, "D")
	pdf.SetXY(leftX, leftY)
	titleBand("Guest Information", 92)
	guestBaseX := leftX + 2
	guestID := "Not verified"
	if g.IDVerified {
		guestID = "Verified"
	}
	kvRow(guestBaseX, "Guest", strings.TrimSpace(g.Name))
	kvRow(guestBaseX, "Phone", strings.TrimSpace(g.Phone))
	kvRow(guestBaseX, "Email", strings.TrimSpace(g.Email))
	kvRow(guestBaseX, "ID Status", guestID)

	rightX := leftX + 94
	pdf.SetXY(rightX, leftY)
	pdf.Rect(rightX, leftY, 92, infoCardHeight, "D")
	titleBand("Stay Summary", 92)
	stayBaseX := rightX + 2
	roomLabel := fmt.Sprintf("%s (%s)", strings.TrimSpace(r.RoomNumber), strings.TrimSpace(r.RoomType.Name))
	kvRow(stayBaseX, "Booking", bookingCode)
	kvRow(stayBaseX, "Room", roomLabel)
	kvRow(stayBaseX, "Check-in", b.CheckInDate.Format("2006-01-02"))
	kvRow(stayBaseX, "Check-out", b.CheckOutDate.Format("2006-01-02"))
	ratePlan := strings.TrimSpace(b.RatePlan)
	if ratePlan == "" {
		ratePlan = "-"
	}
	kvRow(stayBaseX, "Rate Plan", ratePlan)

	pdf.SetY(leftY + infoCardHeight + 4)

	companions := parseCompanionDetailsForInvoice(b.CompanionDetails, b.CompanionDocuments)
	if len(companions) > 0 {
		titleBand("Companion Details", 0)
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetFillColor(239, 245, 252)
		pdf.SetTextColor(22, 44, 73)
		pdf.CellFormat(12, 7, "#", "1", 0, "C", true, 0, "")
		pdf.CellFormat(42, 7, "Name", "1", 0, "L", true, 0, "")
		pdf.CellFormat(22, 7, "Phone", "1", 0, "L", true, 0, "")
		pdf.CellFormat(18, 7, "Age", "1", 0, "L", true, 0, "")
		pdf.CellFormat(24, 7, "Relation", "1", 0, "L", true, 0, "")
		pdf.CellFormat(28, 7, "ID", "1", 0, "L", true, 0, "")
		pdf.CellFormat(40, 7, "Notes", "1", 1, "L", true, 0, "")
		pdf.SetFont("Helvetica", "", 8.8)
		pdf.SetTextColor(31, 42, 55)
		for _, c := range companions {
			idLabel := strings.TrimSpace(strings.TrimSpace(c.IDType) + " " + strings.TrimSpace(c.IDNumber))
			if idLabel == "" {
				idLabel = "-"
			}
			pdf.CellFormat(12, 6.2, fmt.Sprintf("%d", c.Serial), "1", 0, "C", false, 0, "")
			pdf.CellFormat(42, 6.2, c.Name, "1", 0, "L", false, 0, "")
			pdf.CellFormat(22, 6.2, strings.TrimSpace(c.Phone), "1", 0, "L", false, 0, "")
			pdf.CellFormat(18, 6.2, strings.TrimSpace(c.Age), "1", 0, "L", false, 0, "")
			pdf.CellFormat(24, 6.2, strings.TrimSpace(c.Relation), "1", 0, "L", false, 0, "")
			pdf.CellFormat(28, 6.2, idLabel, "1", 0, "L", false, 0, "")
			pdf.CellFormat(40, 6.2, strings.TrimSpace(c.Notes), "1", 1, "L", false, 0, "")
		}
		pdf.Ln(2)
	}

	pdf.Ln(2)
	titleBand("Charge Details", 0)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetFillColor(241, 245, 249) // Slate 100
	pdf.SetTextColor(15, 23, 42)    // Slate 900
	pdf.SetDrawColor(226, 232, 240)
	pdf.CellFormat(116, 7, "Description", "1", 0, "L", true, 0, "")
	pdf.CellFormat(28, 7, "Type", "1", 0, "L", true, 0, "")
	pdf.CellFormat(42, 7, fmt.Sprintf("Amount (%s)", rupee), "1", 1, "R", true, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(31, 42, 55)
	preDiscountSubtotal := inv.Subtotal + inv.Discount
	if preDiscountSubtotal < inv.Subtotal {
		preDiscountSubtotal = inv.Subtotal
	}
	pdf.CellFormat(116, 5.6, fmt.Sprintf("Room Accommodation (%d night(s))", inv.Nights), "1", 0, "L", false, 0, "")
	pdf.CellFormat(28, 5.6, "Room", "1", 0, "L", false, 0, "")
	pdf.CellFormat(42, 5.6, money(inv.BaseRoomCharges), "1", 1, "R", false, 0, "")
	if inv.ExtraGuestCount > 0 && inv.ExtraGuestCharges > 0 {
		pdf.CellFormat(116, 5.6, fmt.Sprintf("Extra Guest Charges (%d x %d night(s))", inv.ExtraGuestCount, inv.Nights), "1", 0, "L", false, 0, "")
		pdf.CellFormat(28, 5.6, "Occupancy", "1", 0, "L", false, 0, "")
		pdf.CellFormat(42, 5.6, money(inv.ExtraGuestCharges), "1", 1, "R", false, 0, "")
	}
	if inv.Discount > 0 {
		pdf.SetTextColor(22, 101, 52)
		pdf.CellFormat(116, 5.6, "Booking Discount", "1", 0, "L", false, 0, "")
		pdf.CellFormat(28, 5.6, "Discount", "1", 0, "L", false, 0, "")
		pdf.CellFormat(42, 5.6, "-"+money(inv.Discount), "1", 1, "R", false, 0, "")
		pdf.SetTextColor(31, 42, 55)
	}
	pdf.CellFormat(116, 5.6, "Total Room Charges", "1", 0, "L", true, 0, "")
	pdf.CellFormat(28, 5.6, "Room", "1", 0, "L", true, 0, "")
	pdf.CellFormat(42, 5.6, money(inv.RoomCharges), "1", 1, "R", true, 0, "")
	for _, it := range inv.FolioItems {
		desc := strings.TrimSpace(it.Description)
		if desc == "" {
			desc = "Additional Services"
		}
		t := strings.TrimSpace(it.Type)
		if t == "" {
			t = "extra"
		}
		pdf.CellFormat(116, 5.6, desc, "1", 0, "L", false, 0, "")
		pdf.CellFormat(28, 5.6, strings.Title(t), "1", 0, "L", false, 0, "")
		pdf.CellFormat(42, 5.6, money(it.Amount), "1", 1, "R", false, 0, "")
	}
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetFillColor(246, 250, 255)
	pdf.CellFormat(144, 5.8, "Subtotal Before Tax", "1", 0, "R", true, 0, "")
	pdf.CellFormat(42, 5.8, money(inv.Subtotal), "1", 1, "R", true, 0, "")

	if len(inv.Payments) > 0 {
		pdf.Ln(3)
		titleBand("Payments Received", 0)
		pdf.SetFont("Helvetica", "B", 9.5)
		pdf.SetFillColor(239, 245, 252)
		pdf.SetTextColor(22, 44, 73)
		pdf.CellFormat(38, 7, "Date", "1", 0, "L", true, 0, "")
		pdf.CellFormat(48, 7, "Method", "1", 0, "L", true, 0, "")
		pdf.CellFormat(58, 7, "Reference", "1", 0, "L", true, 0, "")
		pdf.CellFormat(42, 7, fmt.Sprintf("Amount (%s)", rupee), "1", 1, "R", true, 0, "")
		pdf.SetFont("Helvetica", "", 9.5)
		pdf.SetTextColor(31, 42, 55)
		for _, p := range inv.Payments {
			paid := "-"
			if p.PaidOn != nil {
				paid = p.PaidOn.Format("2006-01-02")
			}
			method := p.Method
			if method == "" {
				method = "-"
			}
			ref := p.Reference
			if ref == "" {
				ref = "-"
			}
			pdf.CellFormat(38, 7, paid, "1", 0, "L", false, 0, "")
			pdf.CellFormat(48, 7, method, "1", 0, "L", false, 0, "")
			pdf.CellFormat(58, 7, ref, "1", 0, "L", false, 0, "")
			pdf.CellFormat(42, 7, money(p.Amount), "1", 1, "R", false, 0, "")
		}
	}

	pdf.Ln(4)
	titleBand("Invoice Summary", 0)
	pdf.SetX(118)
	if inv.Discount > 0 {
		line("Subtotal Before Discount", money(preDiscountSubtotal), false, false)
		pdf.SetX(118)
		line("Discount", "-"+money(inv.Discount), false, false)
		pdf.SetX(118)
	}
	line("Subtotal Before Tax", money(inv.Subtotal), false, false)
	pdf.SetX(118)
	line("Occupancy", fmt.Sprintf("I%d E%d %dN", inv.IncludedGuests, inv.ExtraGuestCount, inv.Nights), false, false)
	if inv.TaxTotal > 0 {
		taxType := strings.TrimSpace(inv.TaxType)
		switch strings.ToUpper(taxType) {
		case "GST":
			// Indian GST splits into CGST + SGST
			pdf.SetX(118)
			line(fmt.Sprintf("CGST (%.1f%%)", inv.TaxPercent/2), money(inv.TaxPart1), false, false)
			pdf.SetX(118)
			line(fmt.Sprintf("SGST (%.1f%%)", inv.TaxPercent/2), money(inv.TaxPart2), false, false)
		default:
			taxLabel := "Tax"
			if taxType != "" {
				taxLabel = fmt.Sprintf("%s (%.1f%%)", taxType, inv.TaxPercent)
			}
			pdf.SetX(118)
			line(taxLabel, money(inv.TaxTotal), false, false)
		}
	}
	pdf.SetX(118)
	line("Grand Total", money(inv.GrandTotal), false, false)
	pdf.SetX(118)
	line("Advance Paid", money(inv.Advance), false, false)
	pdf.SetX(118)
	line("Payments Received", money(inv.PaymentsTotal), false, false)
	pdf.SetX(118)
	line("Total Collected", money(inv.TotalPaid), false, false)
	if strings.EqualFold(inv.Status, "cancelled") {
		returned := inv.RefundDue
		if returned <= 0 {
			returned = inv.CreditBalance
		}
		pdf.SetX(118)
		line("Returned", money(returned), true, true)
	} else if inv.BalanceDue > 0 {
		pdf.SetX(118)
		line("Balance Due", money(inv.BalanceDue), true, false)
	} else if inv.CreditBalance > 0 {
		pdf.SetX(118)
		line("Credit Balance", money(inv.CreditBalance), true, true)
	} else {
		pdf.SetX(118)
		line("Balance Due", money(0), true, true)
	}

	pdf.Ln(2)
	pdf.SetTextColor(95, 107, 122)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.MultiCell(0, 4.4, "This is a computer-generated invoice and does not require a physical signature.", "", "L", false)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func streamInvoicePDFForBooking(c *gin.Context, bookingID, hotelID uint, storedInvoice *models.Invoice) {
	inv, err := calculateInvoiceDataLive(bookingID, hotelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if storedInvoice != nil && storedInvoice.ID != 0 {
		applyStoredInvoiceMetadata(inv, *storedInvoice)
	} else {
		attachStoredInvoiceMetadata(inv, hotelID)
	}

	var b models.Booking
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", inv.BookingID, hotelID).First(&b).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Booking not found"})
		return
	}

	var h models.Hotel
	if err := config.DB.First(&h, hotelID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Hotel not found"})
		return
	}

	var g models.Guest
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", b.GuestID, hotelID).First(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Guest not found"})
		return
	}

	var r models.Room
	if err := config.DB.Where("id = ? AND hotel_id = ? AND deleted_at IS NULL", b.RoomID, hotelID).First(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Room not found"})
		return
	}

	pdfBytes, err := renderInvoiceFallbackPDF(inv, h, b, g, r)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to render invoice PDF: %v", err)})
		return
	}

	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("X-Invoice-Renderer", "controller")
	forceDownload := strings.EqualFold(strings.TrimSpace(c.Query("download")), "1") || strings.EqualFold(strings.TrimSpace(c.Query("download")), "true")
	contentType := "application/pdf"
	if forceDownload {
		contentType = "application/octet-stream"
		c.Header("X-Download-Options", "noopen")
		c.Header("Content-Transfer-Encoding", "binary")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"invoice_%s.pdf\"; filename*=UTF-8''invoice_%s.pdf", inv.InvoiceNo, inv.InvoiceNo))
	} else {
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=\"invoice_%s.pdf\"; filename*=UTF-8''invoice_%s.pdf", inv.InvoiceNo, inv.InvoiceNo))
	}
	c.Header("Content-Type", contentType)
	c.Data(http.StatusOK, contentType, pdfBytes)
}

// DownloadInvoicePDF streams a simple PDF invoice for the booking (live-calculated)
func DownloadInvoicePDF(c *gin.Context) {
	invoiceOrBookingIDStr := c.Param("booking_id")
	hotelID := c.GetUint("active_hotel_id")

	var invoiceOrBookingID uint
	if _, err := fmt.Sscanf(invoiceOrBookingIDStr, "%d", &invoiceOrBookingID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invoice or booking ID"})
		return
	}

	bookingID := invoiceOrBookingID
	var storedInvoice models.Invoice
	if err := config.DB.Where("id = ? AND hotel_id = ?", invoiceOrBookingID, hotelID).First(&storedInvoice).Error; err == nil && storedInvoice.BookingID != 0 {
		bookingID = storedInvoice.BookingID
	}

	streamInvoicePDFForBooking(c, bookingID, hotelID, &storedInvoice)
}
