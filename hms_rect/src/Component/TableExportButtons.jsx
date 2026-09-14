/**
 * TableExportButtons
 * Props:
 *   tableId  - the id of the <table> element to export
 *   filename - base filename (no extension)
 */
function TableExportButtons({ tableId, filename = "export" }) {

    const getRows = () => {
        const table = document.getElementById(tableId)
        if (!table) return { headers: [], rows: [] }
        const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText.trim())
        const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr =>
            Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim())
        )
        return { headers, rows }
    }

    const handleCopy = () => {
        const { headers, rows } = getRows()
        const text = [headers, ...rows].map(r => r.join("\t")).join("\n")
        navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"))
    }

    const handleCSV = () => {
        const { headers, rows } = getRows()
        const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
        download(`${filename}.csv`, "text/csv", csv)
    }

    const handleExcel = () => {
        const { headers, rows } = getRows()
        // Simple TSV wrapped in Excel-compatible XML
        const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sheet1"><Table>${[headers, ...rows].map(r =>
            `<Row>${r.map(c => `<Cell><Data ss:Type="String">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Data></Cell>`).join("")}</Row>`
        ).join("")
            }</Table></Worksheet></Workbook>`
        download(`${filename}.xls`, "application/vnd.ms-excel", xml)
    }

    const handlePrint = () => {
        const table = document.getElementById(tableId)
        if (!table) return
        const win = window.open("", "_blank")
        win.document.write(`<html><head><title>${filename}</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#009688;color:#fff}</style></head><body>${table.outerHTML}</body></html>`)
        win.document.close()
        win.print()
    }

    const download = (name, mime, content) => {
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="btn-group buttonexport" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn-default btn-sm" onClick={handleCopy} title="Copy">
                <i className="fa fa-copy"></i> Copy
            </button>
            <button type="button" className="btn btn-default btn-sm" onClick={handleExcel} title="Excel">
                <i className="fa fa-file-excel-o"></i> Excel
            </button>
            <button type="button" className="btn btn-default btn-sm" onClick={handleCSV} title="CSV">
                <i className="fa fa-file-text-o"></i> CSV
            </button>
            <button type="button" className="btn btn-default btn-sm" onClick={handlePrint} title="Print">
                <i className="fa fa-print"></i> Print
            </button>
        </div>
    )
}

export default TableExportButtons
