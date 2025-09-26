import * as XLSX from "xlsx"
import type { Timetable, ScopeFilter, ScopeMeta, ScheduleEntry } from "./types"

export class TimetableExporter {
  static exportToExcel(timetable: Timetable): void {
    this.exportToExcelScoped(timetable, { department: "ALL", year: "ALL" })
  }

  static exportToCSV(timetable: Timetable): void {
    this.exportToCSVScoped(timetable, { department: "ALL", year: "ALL" })
  }

  static exportAllTimetables(timetables: Timetable[]): void {
    this.exportAllTimetablesScoped(timetables, { department: "ALL", year: "ALL" })
  }

  static exportToExcelScoped(timetable: Timetable, scope: ScopeFilter, scopeMeta?: ScopeMeta): void {
    const workbook = XLSX.utils.book_new()

    // Filter entries based on scope
    const scopedEntries = this.filterEntriesByScope(timetable.entries, scope)

    // Create main schedule sheet with scoped data
    const scheduleData = this.createScheduleSheet({ ...timetable, entries: scopedEntries })
    const scheduleWorksheet = XLSX.utils.aoa_to_sheet(scheduleData)
    XLSX.utils.book_append_sheet(workbook, scheduleWorksheet, "Schedule")

    // Create detailed entries sheet with scoped data
    const entriesData = this.createEntriesSheet({ ...timetable, entries: scopedEntries })
    const entriesWorksheet = XLSX.utils.json_to_sheet(entriesData)
    XLSX.utils.book_append_sheet(workbook, entriesWorksheet, "Detailed Entries")

    if (scopeMeta) {
      const scopeData = this.createScopeSheet(scopeMeta)
      const scopeWorksheet = XLSX.utils.aoa_to_sheet(scopeData)
      XLSX.utils.book_append_sheet(workbook, scopeWorksheet, "Scope")
    }

    // Create summary sheet with scoped data
    const summaryData = this.createSummarySheet({ ...timetable, entries: scopedEntries })
    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Summary")

    const scopeLabel = this.getScopeLabel(scope)
    const fileName = `${timetable.name.replace(/\s+/g, "_")}_${scopeLabel}_${new Date().toISOString().split("T")[0]}.xlsx`
    this.downloadWorkbook(workbook, fileName)
  }

  static exportToCSVScoped(timetable: Timetable, scope: ScopeFilter, scopeMeta?: ScopeMeta): void {
    const scopedEntries = this.filterEntriesByScope(timetable.entries, scope)

    const csvData = scopedEntries.map((entry) => ({
      day: entry.timeSlot.day,
      time: `${entry.timeSlot.startTime}-${entry.timeSlot.endTime}`,
      period: entry.timeSlot.period,
      course_code: entry.course.code,
      course_name: entry.course.name,
      faculty: entry.faculty.name,
      department: entry.faculty.department,
      room: entry.room.name,
      batch: entry.batch.name,
      batch_size: entry.batch.size,
      batch_year: entry.batch.year,
      batch_semester: entry.batch.semester,
      scope_department: scope.department,
      scope_year: scope.year.toString(),
    }))

    const worksheet = XLSX.utils.json_to_sheet(csvData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule")

    const scopeLabel = this.getScopeLabel(scope)
    const fileName = `${timetable.name.replace(/\s+/g, "_")}_${scopeLabel}_${new Date().toISOString().split("T")[0]}.csv`

    try {
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet)
      const blob = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)

      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()

      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("CSV export failed:", error)
      throw new Error(`CSV export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  static exportAllTimetablesScoped(timetables: Timetable[], scope: ScopeFilter, scopeMeta?: ScopeMeta): void {
    const workbook = XLSX.utils.book_new()

    if (scopeMeta) {
      const scopeData = this.createScopeSheet(scopeMeta)
      const scopeWorksheet = XLSX.utils.aoa_to_sheet(scopeData)
      XLSX.utils.book_append_sheet(workbook, scopeWorksheet, "Scope")
    }

    timetables.forEach((timetable) => {
      const scopedEntries = this.filterEntriesByScope(timetable.entries, scope)
      const scopedTimetable = { ...timetable, entries: scopedEntries }

      // Create schedule sheet for each timetable
      const scheduleData = this.createScheduleSheet(scopedTimetable)
      const scheduleWorksheet = XLSX.utils.aoa_to_sheet(scheduleData)
      XLSX.utils.book_append_sheet(workbook, scheduleWorksheet, `${timetable.type}-Schedule`)

      // Create entries sheet for each timetable
      const entriesData = this.createEntriesSheet(scopedTimetable)
      const entriesWorksheet = XLSX.utils.json_to_sheet(entriesData)
      XLSX.utils.book_append_sheet(workbook, entriesWorksheet, `${timetable.type}-Details`)
    })

    // Create comparison sheet with scoped data
    const scopedTimetables = timetables.map((t) => ({
      ...t,
      entries: this.filterEntriesByScope(t.entries, scope),
    }))
    const comparisonData = this.createComparisonSheet(scopedTimetables)
    const comparisonWorksheet = XLSX.utils.aoa_to_sheet(comparisonData)
    XLSX.utils.book_append_sheet(workbook, comparisonWorksheet, "Comparison")

    const scopeLabel = this.getScopeLabel(scope)
    const fileName = `All_Timetables_${scopeLabel}_${new Date().toISOString().split("T")[0]}.xlsx`
    this.downloadWorkbook(workbook, fileName)
  }

  private static downloadWorkbook(workbook: XLSX.WorkBook, fileName: string): void {
    try {
      // Generate binary string
      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

      // Create blob and download
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)

      // Create temporary download link
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export failed:", error)
      throw new Error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  private static createScheduleSheet(timetable: Timetable): any[][] {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    const timeSlots = [
      { period: 1, time: "09:00-10:00" },
      { period: 2, time: "10:00-11:00" },
      { period: 3, time: "11:00-12:00" },
      { period: 4, time: "12:00-13:00" },
      { period: 5, time: "14:00-15:00" },
      { period: 6, time: "15:00-16:00" },
      { period: 7, time: "16:00-17:00" },
    ]

    const data: any[][] = []

    // Header row
    data.push(["Time", ...days])

    // Data rows
    timeSlots.forEach((slot) => {
      const row = [slot.time]
      days.forEach((day) => {
        const entry = timetable.entries.find((e) => e.timeSlot.day === day && e.timeSlot.period === slot.period)
        if (entry) {
          row.push(`${entry.course.code} - ${entry.room.name} - ${entry.faculty.name} (${entry.batch.name})`)
        } else {
          row.push("Free")
        }
      })
      data.push(row)
    })

    return data
  }

  private static createEntriesSheet(timetable: Timetable): any[] {
    return timetable.entries.map((entry) => ({
      Day: entry.timeSlot.day,
      Time: `${entry.timeSlot.startTime}-${entry.timeSlot.endTime}`,
      Period: entry.timeSlot.period,
      "Course Code": entry.course.code,
      "Course Name": entry.course.name,
      Faculty: entry.faculty.name,
      Department: entry.faculty.department,
      Room: entry.room.name,
      "Room Capacity": entry.room.capacity,
      Batch: entry.batch.name,
      "Batch Size": entry.batch.size,
      Program: entry.batch.program,
      Year: entry.batch.year,
      Semester: entry.batch.semester,
    }))
  }

  private static createSummarySheet(timetable: Timetable): any[][] {
    const uniqueRooms = new Set(timetable.entries.map((e) => e.room.id)).size
    const uniqueFaculty = new Set(timetable.entries.map((e) => e.faculty.id)).size
    const uniqueCourses = new Set(timetable.entries.map((e) => e.course.id)).size
    const uniqueBatches = new Set(timetable.entries.map((e) => e.batch.id)).size

    return [
      ["Timetable Summary", ""],
      ["Timetable Name", timetable.name],
      ["Type", timetable.type],
      ["Generated On", new Date().toLocaleDateString()],
      ["", ""],
      ["Statistics", ""],
      ["Total Sessions", timetable.entries.length],
      ["Rooms Used", uniqueRooms],
      ["Faculty Assigned", uniqueFaculty],
      ["Courses Scheduled", uniqueCourses],
      ["Batches Involved", uniqueBatches],
      ["", ""],
      ["Metrics", ""],
      ["Room Utilization", `${timetable.metrics.roomUtilization}%`],
      ["Faculty Utilization", `${timetable.metrics.facultyUtilization}%`],
      ["Clashes", timetable.metrics.clashCount],
    ]
  }

  private static createScopeSheet(scopeMeta: ScopeMeta): any[][] {
    return [
      ["Scope Information", ""],
      ["Department", scopeMeta.department],
      ["Year", scopeMeta.year.toString()],
      ["Filters Applied", scopeMeta.filtersApplied.join(", ") || "None"],
      ["Generated At", new Date(scopeMeta.generatedAt).toLocaleString()],
      ["", ""],
      ["Scoped Statistics", ""],
      ["Total Courses", scopeMeta.totalCourses],
      ["Total Faculty", scopeMeta.totalFaculty],
      ["Total Batches", scopeMeta.totalBatches],
      ["Total Sessions", scopeMeta.totalSessions],
    ]
  }

  private static getScopeLabel(scope: ScopeFilter): string {
    const parts = []
    if (scope.department !== "ALL") parts.push(scope.department.replace(/\s+/g, "_"))
    if (scope.year !== "ALL") parts.push(`Y${scope.year}`)
    return parts.length > 0 ? parts.join("_") : "All"
  }

  private static filterEntriesByScope(entries: ScheduleEntry[], scope: ScopeFilter): ScheduleEntry[] {
    return entries.filter((entry) => {
      const departmentMatch = scope.department === "ALL" || entry.faculty.department === scope.department
      const yearMatch = scope.year === "ALL" || entry.batch.year === scope.year
      return departmentMatch && yearMatch
    })
  }

  private static createComparisonSheet(timetables: Timetable[]): any[][] {
    const data: any[][] = []

    data.push(["Timetable Comparison", "", "", ""])
    data.push(["Metric", ...timetables.map((t) => t.name)])
    data.push(["", "", "", ""])
    data.push(["Total Sessions", ...timetables.map((t) => t.entries.length)])
    data.push(["Room Utilization (%)", ...timetables.map((t) => t.metrics.roomUtilization)])
    data.push(["Faculty Utilization (%)", ...timetables.map((t) => t.metrics.facultyUtilization)])
    data.push(["Clashes", ...timetables.map((t) => t.metrics.clashCount)])
    data.push(["Rooms Used", ...timetables.map((t) => new Set(t.entries.map((e) => e.room.id)).size)])
    data.push(["Faculty Assigned", ...timetables.map((t) => new Set(t.entries.map((e) => e.faculty.id)).size)])

    return data
  }
}
