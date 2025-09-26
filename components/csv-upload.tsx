"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, CheckCircle, AlertCircle, Download } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Papa from "papaparse"
import type { SchedulerData } from "@/lib/types"

interface CSVUploadProps {
  onDataParsed: (data: SchedulerData) => void
  onStepChange: (step: "upload" | "schedule" | "view") => void
}

export function CSVUpload({ onDataParsed, onStepChange }: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any[] | null>(null)
  const [parsedCounts, setParsedCounts] = useState<{
    rooms: number
    faculty: number
    courses: number
    batches: number
    offerings: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please select a CSV file (.csv extension required)")
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      // 10MB limit
      setParseError("File size too large. Please select a file smaller than 10MB")
      return
    }

    setFile(selectedFile)
    setParseError(null)
    setPreviewData(null)
    setParsedCounts(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const parseCSV = () => {
    if (!file) return

    setIsUploading(true)
    setParseError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const csvText = e.target?.result as string

      if (csvText.trim().startsWith("<!DOCTYPE") || csvText.trim().startsWith("<html")) {
        setParseError(
          "The uploaded file contains HTML content instead of CSV data. Please ensure you're uploading a proper CSV file.",
        )
        setIsUploading(false)
        return
      }

      if (csvText.trim().length < 50) {
        setParseError("The uploaded file appears to be empty or too small to contain valid CSV data.")
        setIsUploading(false)
        return
      }

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const data = results.data as any[]

            if (!data || data.length === 0) {
              throw new Error("No data found in CSV file")
            }

            const firstRow = data[0]
            const requiredColumns = ["roomId", "facultyId", "courseCode", "batchId"]
            const missingColumns = requiredColumns.filter((col) => !(col in firstRow))

            if (missingColumns.length > 0) {
              throw new Error(`Missing required columns: ${missingColumns.join(", ")}. Please check your CSV format.`)
            }

            const preview = data.slice(0, 5).map((row) => {
              const cleanRow: any = {}
              Object.keys(row).forEach((key) => {
                const value = String(row[key] || "").substring(0, 50)
                cleanRow[key] = value
              })
              return cleanRow
            })
            setPreviewData(preview)

            // Parse the unified CSV format
            const schedulerData = parseUnifiedCSV(data)

            if (
              schedulerData.rooms.length === 0 ||
              schedulerData.faculty.length === 0 ||
              schedulerData.courses.length === 0 ||
              schedulerData.batches.length === 0
            ) {
              throw new Error("CSV parsing resulted in empty data. Please check your CSV format and content.")
            }

            setParsedCounts({
              rooms: schedulerData.rooms.length,
              faculty: schedulerData.faculty.length,
              courses: schedulerData.courses.length,
              batches: schedulerData.batches.length,
              offerings: schedulerData.offerings.length,
            })

            onDataParsed(schedulerData)
            setIsUploading(false)
          } catch (error) {
            console.error("Parse error:", error)
            setParseError(error instanceof Error ? error.message : "Failed to parse CSV")
            setIsUploading(false)
          }
        },
        error: (error) => {
          console.error("Papa parse error:", error)
          setParseError(`CSV parsing error: ${error.message}`)
          setIsUploading(false)
        },
      })
    }

    reader.onerror = () => {
      setParseError("Failed to read file. Please try again with a different file.")
      setIsUploading(false)
    }

    reader.readAsText(file)
  }

  const parseUnifiedCSV = (data: any[]): SchedulerData => {
    const rooms = new Map()
    const faculty = new Map()
    const courses = new Map()
    const batches = new Map()
    const offerings: any[] = []

    // Generate time slots (Monday-Friday, 9AM-5PM)
    const timeSlots = []
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    const slots = [
      { start: "09:00", end: "10:00", period: 1 },
      { start: "10:00", end: "11:00", period: 2 },
      { start: "11:00", end: "12:00", period: 3 },
      { start: "12:00", end: "13:00", period: 4 },
      { start: "14:00", end: "15:00", period: 5 },
      { start: "15:00", end: "16:00", period: 6 },
      { start: "16:00", end: "17:00", period: 7 },
    ]

    days.forEach((day) => {
      slots.forEach((slot) => {
        timeSlots.push({
          id: `${day}-${slot.period}`,
          day,
          startTime: slot.start,
          endTime: slot.end,
          period: slot.period,
        })
      })
    })

    data.forEach((row, index) => {
      try {
        // Extract room data
        if (row.roomId && row.roomCapacity) {
          if (!rooms.has(row.roomId)) {
            rooms.set(row.roomId, {
              id: row.roomId,
              name: row.roomId,
              capacity: Number.parseInt(row.roomCapacity) || 50,
              type: row.roomType || "Classroom",
            })
          }
        }

        // Extract faculty data
        if (row.facultyId && row.facultyName) {
          if (!faculty.has(row.facultyId)) {
            faculty.set(row.facultyId, {
              id: row.facultyId,
              name: row.facultyName,
              department: row.department || "General",
              preferredSlots: [], // Can be extended later if preferences are added to CSV
            })
          }
        }

        // Extract course data
        if (row.courseCode && row.courseName) {
          if (!courses.has(row.courseCode)) {
            courses.set(row.courseCode, {
              id: row.courseCode,
              name: row.courseName,
              code: row.courseCode,
              credits: Number.parseInt(row.credits) || 3,
              duration: 1, // Default duration
            })
          }
        }

        if (row.batchId) {
          if (!batches.has(row.batchId)) {
            batches.set(row.batchId, {
              id: row.batchId,
              name: row.batchId,
              size: Number.parseInt(row.batchSize) || 30,
              program: row.department || "General",
              year: Number.parseInt(row.year) || 1,
              semester: Number.parseInt(row.semester) || 1,
            })
          }
        }

        // Create offering
        if (row.courseCode && row.facultyId && row.batchId) {
          offerings.push({
            id: `offering-${index}`,
            courseId: row.courseCode,
            facultyId: row.facultyId,
            batchId: row.batchId,
            hoursPerWeek: Number.parseInt(row.hoursPerWeek) || 3,
          })
        }
      } catch (error) {
        console.warn(`Error parsing row ${index}:`, error)
      }
    })

    return {
      rooms: Array.from(rooms.values()),
      faculty: Array.from(faculty.values()),
      courses: Array.from(courses.values()),
      batches: Array.from(batches.values()),
      timeSlots,
      offerings,
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Scheduler Data
        </CardTitle>
        <CardDescription>
          Upload your CSV file containing rooms, faculty, courses, and batch information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Need a sample CSV?</h4>
              <p className="text-xs text-muted-foreground mt-1">Download our sample file to see the expected format</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = document.createElement("a")
                link.href = "/sample-schedule-data.csv"
                link.download = "sample-schedule-data.csv"
                link.click()
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Sample CSV
            </Button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="font-medium text-sm text-blue-900 mb-2">CSV Format Requirements:</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• File must have .csv extension</li>
            <li>• Required columns: roomId, facultyId, courseCode, batchId</li>
            <li>
              • Optional columns: roomCapacity, roomType, facultyName, department, courseName, credits, batchSize, year,
              semester, hoursPerWeek
            </li>
            <li>• First row should contain column headers</li>
          </ul>
        </div>

        {!file && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Drag and drop your CSV file here, or click to browse</p>
            <Button>Choose File</Button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
          </div>
        )}

        {file && !parsedCounts && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
              <FileText className="w-5 h-5" />
              <span className="font-medium">{file.name}</span>
              <span className="text-sm text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <Button onClick={parseCSV} disabled={isUploading} className="w-full">
              {isUploading ? "Parsing..." : "Parse CSV"}
            </Button>
          </div>
        )}

        {parseError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {parsedCounts && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                CSV parsed successfully! Found {parsedCounts.rooms} rooms, {parsedCounts.faculty} faculty,{" "}
                {parsedCounts.courses} courses, {parsedCounts.batches} batches, and {parsedCounts.offerings} offerings.
              </AlertDescription>
            </Alert>

            {previewData && (
              <div className="space-y-2">
                <h4 className="font-medium">Data Preview (First 5 rows):</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border rounded">
                    <thead>
                      <tr className="bg-muted">
                        {Object.keys(previewData[0] || {})
                          .slice(0, 6)
                          .map((key) => (
                            <th key={key} className="p-2 text-left border-r font-medium">
                              {key}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(row)
                            .slice(0, 6)
                            .map((value: any, j) => (
                              <td key={j} className="p-2 border-r text-xs">
                                <span className="block truncate max-w-[100px]">{String(value || "")}</span>
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button onClick={() => onStepChange("schedule")} className="w-full">
              Continue to Scheduling
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
