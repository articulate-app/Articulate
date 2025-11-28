export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return

  // Convert data to CSV format
  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        // Escape quotes and wrap in quotes if contains comma or newline
        const escaped = String(value).replace(/"/g, '""')
        return escaped.includes(',') || escaped.includes('\n') ? `"${escaped}"` : escaped
      }).join(',')
    )
  ].join('\n')

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportToXLSX(data: any[], filename: string) {
  if (data.length === 0) return

  // For now, we'll use a simple CSV export as XLSX
  // In a real implementation, you'd use a library like xlsx or exceljs
  // For simplicity, we'll export as CSV with .xlsx extension
  exportToCSV(data, filename.replace('.xlsx', ''))
} 
 
 
 
 